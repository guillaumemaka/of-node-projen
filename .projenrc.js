const { JsiiProject } = require('projen');

const project = new JsiiProject({
  authorAddress: 'guillaume.maka@gmail.com',
  authorName: 'Guillaume Maka',
  name: 'openfaas-node12-projen',
  repository: 'https://github.com/guillaumemaka/of-node-projen.git',

  entrypoint: 'lib/index.js',
  devDeps: ['@types/fs-extra@^8'], // This will break if it's on 9
  deps: ['projen'],
  peerDeps: ['projen'],
  bundledDeps: ['fs-extra'],
  eslint: false,
  mergify: false,
  projenDevDependency: true,
  defaultReleaseBranch: 'main',
  releaseBranches: ['main'],
  // codeCov: true                                                         /* The parent project, if this project is part of a bigger project. */
  jestOptions: {
    jestConfig: {
      coveragePathIgnorePatterns: ['test/util.ts'],
    },
  },
});

project.synth();
