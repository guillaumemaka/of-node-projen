import { OpenFaasNodeProject } from './../src/index';
import { synthSnapshot, mkdtemp } from './util';
import * as fs from 'fs-extra';
import * as path from 'path';

test('all required file is added', () => {
  // WHEN
  const project = new OpenFaasNodeProject({
    outdir: mkdtemp(),
    name: 'test-openfaas-node-function',
    licensed: false,
    mergify: false,
    projenDevDependency: false,
    ofWatchDogDockerImageTag: '0.7.2',
  });

  // THEN
  const snapshot = synthSnapshot(project);

  // const outDir = project.outdir.substr(1);

  expect(Object.keys(snapshot)).toContain('template.yml');
  expect(snapshot['.dockerignore']).toContain('*/node_modules');
  expect(snapshot.Dockerfile).toContain(
    'FROM --platform=${TARGETPLATFORM:-linux/amd64} openfaas/of-watchdog:0.7.2 as watchdog',
  );
  expect(snapshot['index.js']).toContain("const express = require('express')");
  expect(snapshot['function/handler.js']).toContain('.status(200)');
});

test('all funcDir option', () => {
  // WHEN
  const project = new OpenFaasNodeProject({
    outdir: mkdtemp(),
    name: 'test-openfaas-node-function',
    licensed: false,
    mergify: false,
    projenDevDependency: false,
    funcDir: 'fn',
  });

  // THEN
  const snapshot = synthSnapshot(project);

  // const outDir = project.outdir.substr(1);

  expect(Object.keys(snapshot)).toContain('template.yml');
  expect(snapshot['.dockerignore']).toContain('*/node_modules');
  expect(snapshot.Dockerfile).toContain(
    'FROM --platform=${TARGETPLATFORM:-linux/amd64} openfaas/of-watchdog:0.7.2 as watchdog',
  );
  expect(snapshot['index.js']).toContain("const express = require('express')");
  expect(snapshot['fn/handler.js']).toContain('.status(200)');
});

test('all funcHandler option', () => {
  // WHEN
  const project = new OpenFaasNodeProject({
    outdir: mkdtemp(),
    name: 'test-openfaas-node-function',
    licensed: false,
    mergify: false,
    projenDevDependency: false,
    funcDir: 'fn',
    funcHandler: 'index.js',
  });

  // THEN
  const snapshot = synthSnapshot(project);

  // const outDir = project.outdir.substr(1);
  // console.log(snapshot)

  expect(Object.keys(snapshot)).toContain('template.yml');
  expect(snapshot['.dockerignore']).toContain('*/node_modules');
  expect(snapshot.Dockerfile).toContain(
    'FROM --platform=${TARGETPLATFORM:-linux/amd64} openfaas/of-watchdog:0.7.2 as watchdog',
  );
  expect(snapshot['index.js']).toContain("const express = require('express')");
  expect(snapshot['template.yml']).toContain(
    'You have created a new function which uses Node.js 12 (TLS) and the OpenFaaS',
  );
  expect(snapshot['fn/index.js']).toContain('.status(200)');
});

test('all deps/devDeps/peerDeps option', () => {
  // WHEN
  const project = new OpenFaasNodeProject({
    outdir: mkdtemp(),
    name: 'test-openfaas-node-function',
    licensed: false,
    mergify: false,
    projenDevDependency: false,
    funcDir: 'fn',
    funcHandler: 'index.js',
    functionDeps: ['koa@2.1.3'],
    functionDevDeps: ['typescript@3.3.3'],
    functionPeerDeps: ['body-parser@1.1.1'],
  });

  // THEN
  const snapshot = synthSnapshot(project);

  // const outDir = project.outdir.substr(1)

  expect(Object.keys(snapshot)).toContain('template.yml');
  expect(snapshot['.dockerignore']).toContain('*/node_modules');
  expect(snapshot.Dockerfile).toContain(
    'FROM --platform=${TARGETPLATFORM:-linux/amd64} openfaas/of-watchdog:0.7.2 as watchdog',
  );
  expect(snapshot['index.js']).toContain("const express = require('express')");
  expect(snapshot['fn/index.js']).toContain('.status(200)');
  expect(snapshot['fn/package.json'].dependencies).toEqual({
    koa: '2.1.3',
  });
  expect(snapshot['fn/package.json'].devDependencies).toEqual({
    typescript: '3.3.3',
  });
  expect(snapshot['fn/package.json'].peerDependencies).toEqual({
    'body-parser': '1.1.1',
  });
});

test('should not regenerate Dockerfile if exists', () => {
  // WHEN
  const outdir = mkdtemp();
  const project = new OpenFaasNodeProject({
    outdir: outdir,
    name: 'test-openfaas-node-function',
    licensed: false,
    mergify: false,
    projenDevDependency: false,
    funcDir: 'fn',
    funcHandler: 'index.js',
    functionDeps: ['koa@2.1.3'],
    functionDevDeps: ['typescript@3.3.3'],
    functionPeerDeps: ['body-parser@1.1.1'],
  });

  fs.writeFileSync(path.join(project.outdir, 'Dockerfile'), 'FROM alpine:3.2');

  // THEN
  const snapshot = synthSnapshot(project);

  expect(snapshot.Dockerfile).toContain('FROM alpine:3.2');
});

test('should not regenerate handler function if exists', () => {
  // WHEN
  const outdir = mkdtemp();
  const project = new OpenFaasNodeProject({
    outdir: outdir,
    name: 'test-openfaas-node-function',
    licensed: false,
    mergify: false,
    projenDevDependency: false,
  });

  fs.mkdirSync(path.join(project.outdir, 'function'));
  fs.writeFileSync(
    path.join(project.outdir, 'function', 'handler.js'),
    "const path = require('path');",
  );

  // THEN
  const snapshot = synthSnapshot(project);

  expect(snapshot['function/handler.js']).toContain(
    "const path = require('path');",
  );
});

test('should not regenerate function bootstrap code if exists', () => {
  // WHEN
  const outdir = mkdtemp();
  const project = new OpenFaasNodeProject({
    outdir: outdir,
    name: 'test-openfaas-node-function',
    licensed: false,
    mergify: false,
    projenDevDependency: false,
  });

  fs.writeFileSync(
    path.join(project.outdir, 'index.js'),
    "const path = require('path');",
  );

  // THEN
  const snapshot = synthSnapshot(project);

  expect(snapshot['index.js']).toContain("const path = require('path');");
});

test('should not regenerate function package.json if exists', () => {
  // WHEN
  const outdir = mkdtemp();
  const project = new OpenFaasNodeProject({
    outdir: outdir,
    name: 'test-openfaas-node-function',
    licensed: false,
    mergify: false,
    projenDevDependency: false,
    functionDeps: ['koa@2.1.3'],
    functionDevDeps: ['typescript@3.3.3'],
    functionPeerDeps: ['body-parser@1.1.1'],
  });

  fs.mkdirSync(path.join(project.outdir, 'function'));

  fs.writeFileSync(
    path.join(project.outdir, 'function', 'package.json'),
    JSON.stringify({}),
    { encoding: 'utf8' },
  );

  // THEN
  const snapshot = synthSnapshot(project);

  expect(snapshot['function/package.json'].dependencies).toEqual({
    koa: '2.1.3',
  });
  expect(snapshot['function/package.json'].devDependencies).toEqual({
    typescript: '3.3.3',
  });
  expect(snapshot['function/package.json'].peerDependencies).toEqual({
    'body-parser': '1.1.1',
  });
});
