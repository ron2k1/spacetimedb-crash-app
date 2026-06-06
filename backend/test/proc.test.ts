import { describe, it, expect } from 'vitest';
import { buildPathSearchDirs, parseShimLauncher, spawnJsonLines } from '../src/agent/proc.js';

// These pin the npm-shim parser that lets the engine launch claude / codex on Windows,
// where the CLIs are installed as `.cmd` shims (NOT native exes discoverable by a bare
// spawn). Both real shim shapes are covered:
//   - the "exe wrapper" (claude.cmd -> bin\claude.exe)
//   - the classic "node <cli.js>" wrapper (codex.cmd -> node bin\codex.js)
// The parser is pure (text in, {file,args} out) so this test is deterministic and needs
// neither Windows nor the CLIs installed.
describe('parseShimLauncher (Windows npm shim resolution)', () => {
  it('resolves an exe-wrapper shim to a direct .exe spawn (no node, no leading args)', () => {
    const shim = [
      '@ECHO off',
      'GOTO start',
      ':find_dp0',
      'SET dp0=%~dp0',
      'EXIT /b',
      ':start',
      'SETLOCAL',
      'CALL :find_dp0',
      '"%dp0%\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe"   %*',
    ].join('\r\n');

    const r = parseShimLauncher(shim, 'C:\\Users\\me\\AppData\\Roaming\\npm');
    expect(r).not.toBeNull();
    expect(r!.args).toEqual([]);
    expect(r!.file).toBe(
      'C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe',
    );
  });

  it('resolves a node-wrapper shim to `<node> <cli.js>` (script as a leading arg)', () => {
    const shim = [
      '@ECHO off',
      'GOTO start',
      ':find_dp0',
      'SET dp0=%~dp0',
      'EXIT /b',
      ':start',
      'SETLOCAL',
      'CALL :find_dp0',
      'IF EXIST "%dp0%\\node.exe" (',
      '  SET "_prog=%dp0%\\node.exe"',
      ') ELSE (',
      '  SET "_prog=node"',
      '  SET PATHEXT=%PATHEXT:;.JS;=;%',
      ')',
      'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*',
    ].join('\r\n');

    const r = parseShimLauncher(shim, 'C:\\Users\\me\\AppData\\Roaming\\npm');
    expect(r).not.toBeNull();
    expect(r!.file).toBe(process.execPath);
    expect(r!.args).toEqual([
      'C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\bin\\codex.js',
    ]);
  });

  it('does not recurse into the packaged Crash engine when resolving a node-wrapper shim', () => {
    const shim = [
      '@ECHO off',
      'SETLOCAL',
      'CALL :find_dp0',
      'IF EXIST "%dp0%\\node.exe" (',
      '  SET "_prog=%dp0%\\node.exe"',
      ') ELSE (',
      '  SET "_prog=node"',
      ')',
      'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*',
    ].join('\r\n');

    const r = parseShimLauncher(
      shim,
      'C:\\Users\\me\\AppData\\Roaming\\npm',
      'C:\\Program Files\\nodejs\\node.exe',
    );

    expect(r).not.toBeNull();
    expect(r!.file).toBe('C:\\Program Files\\nodejs\\node.exe');
    expect(r!.args).toEqual([
      'C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\bin\\codex.js',
    ]);
  });

  it('returns null when no node_modules launcher line is present', () => {
    const shim = '@ECHO off\r\necho "nothing to launch here"\r\n';
    expect(parseShimLauncher(shim, 'C:\\x')).toBeNull();
  });

  it('adds Windows global npm and node install dirs when packaged PATH is thin', () => {
    const dirs = buildPathSearchDirs(
      {
        PATH: 'C:\\Windows\\System32;C:\\Users\\me\\AppData\\Roaming\\npm',
        APPDATA: 'C:\\Users\\me\\AppData\\Roaming',
        ProgramFiles: 'C:\\Program Files',
        'ProgramFiles(x86)': 'C:\\Program Files (x86)',
      },
      'C:\\Users\\me\\AppData\\Local\\Crash\\crash-engine.exe',
      'win32',
    );

    expect(dirs).toContain('C:\\Users\\me\\AppData\\Roaming\\npm');
    expect(dirs).toContain('C:\\Program Files\\nodejs');
    expect(dirs).toContain('C:\\Program Files (x86)\\nodejs');
    expect(dirs).toContain('C:\\Users\\me\\AppData\\Local\\Crash');
    expect(dirs.filter((dir) => dir === 'C:\\Users\\me\\AppData\\Roaming\\npm')).toHaveLength(1);
  });

  it('streams stdout and stderr with their source channel', async () => {
    const ac = new AbortController();
    const seen = [];
    const script = [
      'console.log(JSON.stringify({ok:true}))',
      'console.error(JSON.stringify({problem:true}))',
    ].join(';');

    for await (const line of spawnJsonLines(process.execPath, ['-e', script], {
      cwd: process.cwd(),
      signal: ac.signal,
    })) {
      seen.push(line);
    }

    expect(seen).toEqual([
      { stream: 'stdout', raw: '{"ok":true}', json: { ok: true } },
      { stream: 'stderr', raw: '{"problem":true}', json: { problem: true } },
    ]);
  });
});
