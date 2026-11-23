#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const refIndex = args.indexOf('--ref');
const compareIndex = args.indexOf('--compare');
const sourceRef = refIndex >= 0 ? args[refIndex + 1] : null;
const comparePath = compareIndex >= 0 ? path.resolve(ROOT, args[compareIndex + 1]) : null;

function git(gitArgs) {
  return execFileSync('git', gitArgs, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function readSources() {
  const files = sourceRef
    ? git(['ls-tree', '-r', '--name-only', sourceRef]).split(/\r?\n/).filter(Boolean)
    : git(['ls-files', '-z']).split('\0').filter(Boolean);
  const allowed = /\.(?:cjs|js|mjs|ts|tsx|jsx)$/i;
  const sources = [];
  for (const file of files.sort()) {
    if (!allowed.test(file) || file.includes('/node_modules/')) continue;
    try {
      const content = sourceRef
        ? git(['show', sourceRef + ':' + file])
        : fs.readFileSync(path.join(ROOT, file), 'utf8');
      sources.push({ file, content });
    } catch {
      // A generated or unavailable source file is not part of the inventory.
    }
  }
  return sources;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function matches(source, regex, map) {
  const result = [];
  for (const match of source.matchAll(regex)) result.push(map ? map(match) : match[1]);
  return result;
}

function splitSqlColumns(body) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];
    if (quote) {
      if (char === quote && body[i - 1] !== '\\') quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === String.fromCharCode(96)) { quote = char; continue; }
    if (char === '(') depth += 1;
    else if (char === ')') depth = Math.max(0, depth - 1);
    else if (char === ',' && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(body.slice(start));
  return parts;
}

function inventory(sources) {
  const routes = [];
  const socketReceived = [];
  const socketEmitted = [];
  const ipc = { mainHandle: [], mainOn: [], rendererInvoke: [], rendererSend: [], webContentsSend: [] };
  const tables = new Map();
  const alteredColumns = [];

  for (const { content } of sources) {
    routes.push(...matches(content, /\b(?:app|router)\.(get|post|put|patch|delete|options|head)\s*\(\s*(['"\x60])([^'"\x60]+)\2/g,
      (m) => m[1].toUpperCase() + ' ' + m[3]));
    socketReceived.push(...matches(content, /\bsocket\.on\s*\(\s*(['"\x60])([^'"\x60]+)\1/g, (m) => m[2]));
    socketEmitted.push(...matches(content, /\.emit\s*\(\s*(['"\x60])([^'"\x60]+)\1/g, (m) => m[2]));

    ipc.mainHandle.push(...matches(content, /\bipcMain\.handle\s*\(\s*(['"\x60])([^'"\x60]+)\1/g, (m) => m[2]));
    ipc.mainOn.push(...matches(content, /\bipcMain\.on\s*\(\s*(['"\x60])([^'"\x60]+)\1/g, (m) => m[2]));
    ipc.rendererInvoke.push(...matches(content, /\bipcRenderer\.invoke\s*\(\s*(['"\x60])([^'"\x60]+)\1/g, (m) => m[2]));
    ipc.rendererSend.push(...matches(content, /\bipcRenderer\.send\s*\(\s*(['"\x60])([^'"\x60]+)\1/g, (m) => m[2]));
    ipc.webContentsSend.push(...matches(content, /\bwebContents\.send\s*\(\s*(['"\x60])([^'"\x60]+)\1/g, (m) => m[2]));

    for (const match of content.matchAll(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+["'\x60]?([A-Za-z_][\w]*)["'\x60]?\s*\(([\s\S]*?)\)\s*(?:;|\x60)/gi)) {
      const table = match[1];
      const columns = splitSqlColumns(match[2]).map((part) => {
        const trimmed = part.trim();
        const column = trimmed.match(/^["'\x60]?([A-Za-z_][\w]*)["'\x60]?\s+/);
        if (!column || /^(?:PRIMARY|UNIQUE|FOREIGN|CHECK|CONSTRAINT)$/i.test(column[1])) return null;
        return column[1];
      }).filter(Boolean);
      if (!tables.has(table)) tables.set(table, new Set());
      for (const column of columns) tables.get(table).add(column);
    }

    for (const match of content.matchAll(/ALTER\s+TABLE\s+["'\x60]?([A-Za-z_][\w]*)["'\x60]?\s+ADD\s+COLUMN\s+["'\x60]?([A-Za-z_][\w]*)/gi)) {
      alteredColumns.push(match[1] + '.' + match[2]);
      if (!tables.has(match[1])) tables.set(match[1], new Set());
      tables.get(match[1]).add(match[2]);
    }

    // The legacy 0.0.8 server declared compatibility columns through ensure*Column()
    // helpers. Count those declarations as schema columns just like literal ALTER TABLE.
    const ensuredTables = {
      ServerMessage: 'server_messages',
      User: 'users',
      Channel: 'channels',
      Server: 'servers',
      Message: 'messages'
    };
    for (const match of content.matchAll(/ensure(ServerMessage|User|Channel|Server|Message)Column\s*\(\s*(['"\x60])([^'"\x60]+)\2/g)) {
      const table = ensuredTables[match[1]];
      if (!tables.has(table)) tables.set(table, new Set());
      tables.get(table).add(match[3]);
    }
  }

  return {
    routes: uniqueSorted(routes),
    socket: { received: uniqueSorted(socketReceived), emitted: uniqueSorted(socketEmitted) },
    ipc: Object.fromEntries(Object.entries(ipc).map(([key, values]) => [key, uniqueSorted(values)])),
    database: {
      tables: [...tables.entries()].sort(([a], [b]) => a.localeCompare(b))
        .map(([name, columns]) => ({ name, columns: uniqueSorted([...columns]) })),
      alteredColumns: uniqueSorted(alteredColumns)
    }
  };
}

const result = inventory(readSources());

if (comparePath) {
  const baseline = JSON.parse(fs.readFileSync(comparePath, 'utf8'));
  const sections = ['routes', 'socket', 'ipc', 'database'];
  // This migration ledger is an intentional, additive internal table; it does not
  // alter any pre-existing application table or public API contract.
  const comparable = (value, key) => key === 'database'
    ? { ...value, tables: value.tables.filter((table) => table.name !== 'app_migrations') }
    : value;
  const differences = sections.filter((key) =>
    JSON.stringify(comparable(result[key], key)) !== JSON.stringify(comparable(baseline[key], key))
  );
  if (differences.length) {
    console.error('Inventory differs from baseline: ' + comparePath);
    for (const key of differences) {
      console.error('\n' + key + ':');
      console.error('current: ' + JSON.stringify(result[key]));
      console.error('baseline: ' + JSON.stringify(baseline[key]));
    }
    process.exitCode = 1;
  } else {
    console.log('Inventory matches baseline.');
  }
} else {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
