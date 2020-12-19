import { OpenFaasNodeProject } from './../src/index'
import { synthSnapshot, mkdtemp } from './util'

test('all required file is added', () => {
  // WHEN
  const project = new OpenFaasNodeProject({
    outdir: mkdtemp(),
    name: 'test-openfaas-node-function',
    licensed: false,
    mergify: false,
    projenDevDependency: false,
    ofWatchDogDockerImageTag: '0.7.2'
  })

  // THEN
  const snapshot = synthSnapshot(project)

  // const outDir = project.outdir.substr(1);

  expect(Object.keys(snapshot)).toContain('template.yml')
  expect(snapshot['.dockerignore']).toContain('*/node_modules')
  expect(snapshot.Dockerfile).toContain(
    'FROM --platform=${TARGETPLATFORM:-linux/amd64} openfaas/of-watchdog:0.7.2 as watchdog'
  )
  expect(snapshot['index.js']).toContain("const express = require('express')")
  expect(snapshot['function/handler.js']).toContain('.status(200)')
})
