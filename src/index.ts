import * as fs from 'fs-extra';
import {
  NodeProjectOptions,
  NodeProject,
  Semver,
  JsonFile,
  Component,
  Project,
  YamlFile,
  IgnoreFile,
} from 'projen';
import * as path from 'path';
export interface OpenFaasFunctionOptions extends NodeProjectOptions {
  /**
   * function directory to deploy
   *
   * @default function
   */
  readonly funcDir?: string;

  readonly functionDeps?: string[];
  readonly functionDevDeps?: string[];
  readonly functionPeerDeps?: string[];
  readonly funcHandler?: string;

  /**
   * @default 0.7.2
   */
  readonly ofWatchDogDockerImageTag?: string;
}

export class OpenFaasNodeProject extends NodeProject {
  private readonly funcDir: string;
  private readonly funcDeps: Record<string, string> = {};
  private readonly funcDevDeps: Record<string, string> = {};
  private readonly funcPeerDeps: Record<string, string> = {};
  private readonly funcManifest: Record<string, any> = {};
  private readonly funcHandler: string;
  private readonly options: OpenFaasFunctionOptions;

  constructor(options: OpenFaasFunctionOptions) {
    super({
      ...options,
      entrypoint: 'index.js',
    });

    const defaultOptions = {
      ofWatchDogDockerImageTag: '0.7.2',
    };

    this.options = Object.assign(options, defaultOptions);

    this.funcDir = this.options.funcDir
      ? path.join(this.outdir, this.options.funcDir)
      : path.join(this.outdir, 'function');

    if (!fs.pathExistsSync(this.funcDir)) {
      fs.mkdirSync(this.funcDir);
    }

    this.funcHandler = this.options.funcHandler || 'handler.js';

    this.funcManifest = {
      name: 'openfaas-function',
      version: this.manifest.version,
      description: this.options.description,
      main: this.funcHandler,
      scripts: {
        test: 'echo "Error: no test specified" && exit 0',
      },
      keywords: [],
      author: 'OpenFaaS Ltd',
      license: this.options.license,
    };

    this.addDeps('body-parser@^1.18.2', 'express@^4.16.2');

    this._addFuncDependencies(...(this.options.functionDeps || []));
    this._addFuncDevDependencies(...(this.options.functionDevDeps || []));
    this._addFuncPeerDependencies(...(this.options.functionPeerDeps || []));

    this.funcManifest.dependencies = this.funcDeps;
    this.funcManifest.devDependencies = this.funcDevDeps;
    this.funcManifest.peerDependencies = this.funcPeerDeps;

    new JsonFile(this, this.funcDir, {
      obj: this.funcManifest,
      readonly: false,
    });

    const templateManifest = {
      language: 'node12',
      fprocess: `node ${this.funcHandler}`,
      welcome_message: `
You have created a new function which uses Node.js 12 (TLS) and the OpenFaaS
of-watchdog which gives greater control over HTTP responses.
npm i --save can be used to add third-party packages like request or cheerio
npm documentation: https://docs.npmjs.com/
Unit tests are run at build time via "npm run", edit package.json to specify 
how you want to execute them.
    `,
    };

    const dockerIgnore = new IgnoreFile(
      this,
      path.join(this.outdir, '.dockerignore'),
    );

    dockerIgnore.exclude('*/node_modules');

    new YamlFile(this, path.join(this.outdir, 'template.yml'), {
      obj: templateManifest,
      readonly: false,
    });
    new FunctionCode(this, this.funcDir, this.funcHandler);
    new IndexCode(this);
    new Dockerfile(this, { tag: this.options.ofWatchDogDockerImageTag! });
  }

  /**
   *
   * @param deps
   * @internal
   */
  _addFuncDependencies(...deps: string[]) {
    const sortedAndParsed = this._loadDeps(...deps);
    for (const [k, v] of Object.entries(sortedAndParsed)) {
      this.funcDeps[k] = typeof v === 'string' ? v : v.spec;
    }
  }

  /**
   *
   * @param deps
   * @internal
   */
  _addFuncDevDependencies(...deps: string[]) {
    const sortedAndParsed = this._loadDeps(...deps);
    for (const [k, v] of Object.entries(sortedAndParsed)) {
      this.funcDevDeps[k] = typeof v === 'string' ? v : v.spec;
    }
  }

  /**
   *
   * @param deps
   * @internal
   */
  _addFuncPeerDependencies(...deps: string[]) {
    const sortedAndParsed = this._loadDeps(...deps);
    for (const [k, v] of Object.entries(sortedAndParsed)) {
      this.funcPeerDeps[k] = typeof v === 'string' ? v : v.spec;
    }
  }

  /**
   *
   * @param dependencies
   * @internal
   */
  _loadDeps(...dependencies: string[]): Record<string, Semver> {
    return sorted(dependencies)()
      .map(parseDep)
      .reduce((acc, prev: Record<string, Semver>) => {
        return { ...acc, ...prev };
      }, {});
  }
}

interface DockerfileOptions {
  readonly tag: string;
}
class Dockerfile extends Component {
  private readonly tag: string;
  constructor(project: Project, options: DockerfileOptions) {
    super(project);
    this.tag = options.tag;
  }

  synthesize() {
    if (
      fs
        .readdirSync(this.project.outdir)
        .filter((x) => x.localeCompare('Dockerfile'))
    ) {
      return;
    }

    const dockerfile = `
FROM --platform=\${TARGETPLATFORM:-linux/amd64} openfaas/of-watchdog:${this.tag} as watchdog
FROM --platform=\${TARGETPLATFORM:-linux/amd64} node:12-alpine as ship

ARG TARGETPLATFORM
ARG BUILDPLATFORM

COPY --from=watchdog /fwatchdog /usr/bin/fwatchdog
RUN chmod +x /usr/bin/fwatchdog

RUN apk --no-cache add curl ca-certificates \
    && addgroup -S app && adduser -S -g app app

WORKDIR /root/

# Turn down the verbosity to default level.
ENV NPM_CONFIG_LOGLEVEL warn

RUN mkdir -p /home/app

# Wrapper/boot-strapper
WORKDIR /home/app
COPY package.json ./

# This ordering means the npm installation is cached for the outer function handler.
RUN npm i

# Copy outer function handler
COPY index.js ./

# COPY function node packages and install, adding this as a separate
# entry allows caching of npm install

WORKDIR /home/app/function

COPY function/*.json ./

RUN npm i || :

# COPY function files and folders
COPY function/ ./

# Run any tests that may be available
RUN npm test

# Set correct permissions to use non root user
WORKDIR /home/app/

# chmod for tmp is for a buildkit issue (@alexellis)
RUN chown app:app -R /home/app \
    && chmod 777 /tmp

USER app

ENV cgi_headers="true"
ENV fprocess="node index.js"
ENV mode="http"
ENV upstream_url="http://127.0.0.1:3000"

ENV exec_timeout="10s"
ENV write_timeout="15s"
ENV read_timeout="15s"

HEALTHCHECK --interval=3s CMD [ -e /tmp/.lock ] || exit 1

CMD ["fwatchdog"]


    `;

    fs.writeFileSync(path.join(this.project.outdir), dockerfile);
  }
}

class FunctionCode extends Component {
  private readonly funcDir: string;
  private readonly handler: string;
  constructor(
    project: Project,
    funcDir: string,
    handler: string = 'handler.js',
  ) {
    super(project);
    this.funcDir = funcDir;
    this.handler = handler;
  }

  synthesize() {
    if (
      fs.pathExistsSync(this.funcDir) &&
      fs.readdirSync(this.funcDir).filter((x) => x.endsWith('.js'))
    ) {
      return;
    }

    const functionCode = `
'use strict'

module.exports = async (event, context) => {
  const result = {
    'status': 'Received input: ' + JSON.stringify(event.body)
  }

  return context
    .status(200)
    .succeed(result)
}

    `;

    fs.writeFileSync(path.join(this.funcDir, this.handler), functionCode);
  }
}

class IndexCode extends Component {
  constructor(project: Project) {
    super(project);
  }

  synthesize() {
    if (
      fs
        .readdirSync(this.project.outdir)
        .filter((x) => x.localeCompare('index.js'))
    ) {
      return;
    }

    const functionCode = `
// Copyright (c) Alex Ellis 2017. All rights reserved.
// Copyright (c) OpenFaaS Author(s) 2020. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

"use strict"

const express = require('express')
const app = express()
const handler = require('./function/handler');
const bodyParser = require('body-parser')

if (process.env.RAW_BODY === 'true') {
    app.use(bodyParser.raw({ type: '*/*' }))
} else {
    var jsonLimit = process.env.MAX_JSON_SIZE || '100kb' //body-parser default
    app.use(bodyParser.json({ limit: jsonLimit}));
    app.use(bodyParser.raw()); // "Content-Type: application/octet-stream"
    app.use(bodyParser.text({ type : "text/*" }));
}

app.disable('x-powered-by');

class FunctionEvent {
    constructor(req) {
        this.body = req.body;
        this.headers = req.headers;
        this.method = req.method;
        this.query = req.query;
        this.path = req.path;
    }
}

class FunctionContext {
    constructor(cb) {
        this.value = 200;
        this.cb = cb;
        this.headerValues = {};
        this.cbCalled = 0;
    }

    status(value) {
        if(!value) {
            return this.value;
        }

        this.value = value;
        return this;
    }

    headers(value) {
        if(!value) {
            return this.headerValues;
        }

        this.headerValues = value;
        return this;    
    }

    succeed(value) {
        let err;
        this.cbCalled++;
        this.cb(err, value);
    }

    fail(value) {
        let message;
        this.cbCalled++;
        this.cb(value, message);
    }
}

var middleware = async (req, res) => {
    let cb = (err, functionResult) => {
        if (err) {
            console.error(err);

            return res.status(500).send(err.toString ? err.toString() : err);
        }

        if(isArray(functionResult) || isObject(functionResult)) {
            res.set(fnContext.headers()).status(fnContext.status()).send(JSON.stringify(functionResult));
        } else {
            res.set(fnContext.headers()).status(fnContext.status()).send(functionResult);
        }
    };

    let fnEvent = new FunctionEvent(req);
    let fnContext = new FunctionContext(cb);

    Promise.resolve(handler(fnEvent, fnContext, cb))
    .then(res => {
        if(!fnContext.cbCalled) {
            fnContext.succeed(res);
        }
    })
    .catch(e => {
        cb(e);
    });
};

app.post('/*', middleware);
app.get('/*', middleware);
app.patch('/*', middleware);
app.put('/*', middleware);
app.delete('/*', middleware);
app.options('/*', middleware);

const port = process.env.http_port || 3000;

app.listen(port, () => {
    console.log(\`OpenFaaS Node.js listening on port: \${port}\`)
});

let isArray = (a) => {
    return (!!a) && (a.constructor === Array);
};

let isObject = (a) => {
    return (!!a) && (a.constructor === Object);
};
    `;

    fs.writeFileSync(path.join(this.project.outdir, 'index.js'), functionCode);
  }
}

function sorted<T>(toSort: T) {
  return () => {
    if (Array.isArray(toSort)) {
      return toSort.sort();
    } else if (toSort != null && typeof toSort === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(toSort).sort(([l], [r]) =>
        l.localeCompare(r),
      )) {
        result[key] = value;
      }
      return result as T;
    } else {
      return toSort;
    }
  };
}

function parseDep(dep: string): Record<string, Semver> {
  const scope = dep.startsWith('@');
  if (scope) {
    dep = dep.substr(1);
  }

  const [name, version] = dep.split('@');
  let depname = scope ? `@${name}` : name;
  return { [depname]: Semver.of(version ?? '*') };
}
