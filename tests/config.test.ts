import {afterEach, beforeEach, describe, expect, it} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {modelRuntime} from '../src/model-runtime.ts';
import {getConfigPath, getGlobalConfigPath, loadConfig, saveConfig, setConfigOverride, resetConfigOverride, inspectConfig, resolveCloudCredentials} from '../src/config.ts';

describe('configuration layers', () => {
  let root: string;
  let oldHome: string | undefined;
  beforeEach(() => {
    oldHome = process.env.HOME;
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-config-'));
    process.env.HOME = path.join(root, 'home');
    fs.mkdirSync(process.env.HOME, {recursive: true});
  });
  afterEach(() => {
    if (oldHome === undefined) delete process.env.HOME; else process.env.HOME = oldHome;
    fs.rmSync(root, {recursive: true, force: true});
  });
  it('keeps explicit layers and reveals the inherited model after project reset', () => {
    setConfigOverride(root, 'model', 'global-model', 'global');
    expect(loadConfig(root).model).toBe('global-model');
    setConfigOverride(root, 'model', 'project-model');
    expect(inspectConfig(root, 'model')[0]).toEqual({key: 'model', value: 'project-model', source: 'project'});
    saveConfig(root, {autoSync: false});
    expect(JSON.parse(fs.readFileSync(getConfigPath(root), 'utf8'))).toEqual({model: 'project-model', autoSync: false});
    resetConfigOverride(root, 'model');
    expect(loadConfig(root).model).toBe('global-model');
    expect(inspectConfig(root, 'model')[0]?.source).toBe('global');
    expect(JSON.parse(fs.readFileSync(getConfigPath(root), 'utf8'))).toEqual({autoSync: false});
    expect(JSON.parse(fs.readFileSync(getGlobalConfigPath(), 'utf8'))).toEqual({model: 'global-model'});
  });
  it('preserves global credentials and unrelated fields while superseding legacy aliases', () => {
    fs.mkdirSync(path.dirname(getGlobalConfigPath()), {recursive: true});
    const original = {providers: {ollama: {plannerModel: 'legacy-model'}, openai: {apiKey: 'hidden-secret'}}, custom: 'retained'};
    fs.writeFileSync(getGlobalConfigPath(), JSON.stringify(original));
    expect(loadConfig(root).model).toBe('legacy-model');
    setConfigOverride(root, 'model', 'explicit-model', 'global');
    expect(loadConfig(root).model).toBe('explicit-model');
    const raw = JSON.parse(fs.readFileSync(getGlobalConfigPath(), 'utf8'));
    expect(raw.providers.openai.apiKey).toBe('hidden-secret');
    expect(raw.custom).toBe('retained');
    expect(raw.providers.ollama.plannerModel).toBeUndefined();
    expect(resolveCloudCredentials().openaiApiKey).toBe(process.env.OPENAI_API_KEY || 'hidden-secret');
    expect(JSON.stringify(inspectConfig(root))).not.toContain('hidden-secret');
  });
  it('refuses malformed configuration without changing its bytes', () => {
    fs.mkdirSync(path.dirname(getConfigPath(root)), {recursive: true});
    for (const invalid of ['{', '[]', '{"model":42}']) {
      fs.writeFileSync(getConfigPath(root), invalid);
      expect(() => loadConfig(root)).toThrow();
      expect(() => saveConfig(root, {autoSync: false})).toThrow();
      expect(() => resetConfigOverride(root, 'model')).toThrow();
      expect(fs.readFileSync(getConfigPath(root), 'utf8')).toBe(invalid);
    }
  });
  it('rejects invalid settings and project secrets, and redacts legacy provider options', () => {
    expect(() => setConfigOverride(root, 'autoSync', 'maybe')).toThrow();
    expect(() => setConfigOverride(root, 'maxArtifacts', '-1')).toThrow();
    expect(() => setConfigOverride(root, 'openrouterApiKey', 'secret')).toThrow();
    expect(() => saveConfig(root, {openrouterApiKey: 'secret'})).toThrow();
    expect(() => setConfigOverride(root, 'providerOptions', '{"openai":{"apiKey":"secret"}}')).toThrow();
    fs.mkdirSync(path.dirname(getConfigPath(root)), {recursive: true});
    fs.writeFileSync(getConfigPath(root), JSON.stringify({openrouterApiKey: 'legacy-secret', providerOptions: {openai: {authorization: 'legacy-secret'}}}));
    expect(loadConfig(root).openrouterApiKey).toBeUndefined();
    expect(JSON.stringify(inspectConfig(root))).not.toContain('legacy-secret');
    expect(() => inspectConfig(root, 'openrouterApiKey')).toThrow();
  });
  it('constructs providers from the same effective URL shown by configuration', () => {
    const oldHost = process.env.OLLAMA_HOST;
    try {
      process.env.OLLAMA_HOST = 'http://environment:11434';
      setConfigOverride(root, 'ollamaUrl', 'http://global:11434', 'global');
      setConfigOverride(root, 'ollamaUrl', 'http://project:11434');
      expect(modelRuntime(root).providers.ollama?.host).toBe('http://project:11434');
      resetConfigOverride(root, 'ollamaUrl');
      expect(modelRuntime(root).providers.ollama?.host).toBe('http://global:11434');
      resetConfigOverride(root, 'ollamaUrl', 'global');
      expect(modelRuntime(root).providers.ollama?.host).toBe('http://environment:11434');
    } finally {
      if (oldHost === undefined) delete process.env.OLLAMA_HOST; else process.env.OLLAMA_HOST = oldHost;
    }
  });
  it('merges nested options from both explicit layers', () => {
    setConfigOverride(root, 'modelRadar', '{"enabled":false}', 'global');
    setConfigOverride(root, 'modelRadar', '{"probeIntervalDays":7}');
    expect(loadConfig(root).modelRadar).toMatchObject({enabled: false, probeIntervalDays: 7});
  });
});
