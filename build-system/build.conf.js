/**
 * Copyright 2018 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const argv = require('minimist')(process.argv.slice(2));
const experimentsConfig = require('./global-configs/experiments-config.json');

const defaultPlugins = [
  require.resolve('./babel-plugins/babel-plugin-transform-html-template'),
  require.resolve(
    './babel-plugins/babel-plugin-transform-parenthesize-expression'
  ),
  require.resolve(
    './babel-plugins/babel-plugin-is_minified-constant-transformer'
  ),
  require.resolve('./babel-plugins/babel-plugin-transform-amp-extension-call'),
  require.resolve('./babel-plugins/babel-plugin-transform-version-call'),
];

/**
 * @return {Array<string|Object>} the minify-replace plugin options that can be
 * pushed into the babel plugins array
 */
function getReplacePlugin_() {
  /**
   * @param {string} defineStr the define flag to parse
   * @return {Object} replacement options used by minify-replace plugin
   */
  function createReplacement(defineStr) {
    const strSplit = defineStr.split('=');
    const identifierName = strSplit[0];
    // if no value is defined, set to true
    const value = strSplit.length > 1 ? strSplit[1] === 'true' : true;

    return {
      identifierName,
      replacement: {
        type: 'booleanLiteral',
        value,
      },
    };
  }

  const replacements = [];
  // default each experiment flag constant to false
  Object.keys(experimentsConfig).forEach(experiment => {
    const experimentDefine = experimentsConfig[experiment]['define'];
    if (experimentDefine) {
      replacements.push(createReplacement(experimentDefine + '=false'));
    }
  });

  // override define values from passed in flags
  if (Array.isArray(argv.define)) {
    argv.define.forEach(defineStr => {
      replacements.push(createReplacement(defineStr));
    });
  } else if (argv.define) {
    replacements.push(createReplacement(argv.define));
  }

  const replacePlugin = [
    require.resolve('babel-plugin-minify-replace'),
    {replacements},
  ];

  return replacePlugin;
}

module.exports = {
  plugins({isEsmBuild, isForTesting, isSinglePass}) {
    let pluginsToApply = defaultPlugins;
    // TODO(erwinm): This is temporary until we remove the assert/log removals
    // from the java transformation to the babel transformation.
    // There is currently a weird interaction where when we do the transform
    // in babel and leave a bare "string", Closure Compiler does not remove
    // the dead string expression statements. We cannot just outright remove
    // the argument of the assert/log calls since we would need to inspect
    // if the arguments have any method calls (which might have side effects).
    if (isSinglePass) {
      pluginsToApply.push(
        require.resolve('./babel-plugins/babel-plugin-transform-amp-asserts')
      );
    }
    if (isEsmBuild) {
      pluginsToApply = pluginsToApply.concat([
        [
          require.resolve('babel-plugin-filter-imports'),
          {
            'imports': {
              './polyfills/fetch': ['installFetch'],
              './polyfills/domtokenlist-toggle': ['installDOMTokenListToggle'],
              './polyfills/document-contains': ['installDocContains'],
              './polyfills/math-sign': ['installMathSign'],
              './polyfills/object-assign': ['installObjectAssign'],
              './polyfills/object-values': ['installObjectValues'],
              './polyfills/promise': ['installPromise'],
            },
          },
        ],
      ]);
    }
    if (!isForTesting) {
      pluginsToApply = pluginsToApply.concat([
        require.resolve(
          './babel-plugins/babel-plugin-is_dev-constant-transformer'
        ),
        require.resolve('./babel-plugins/babel-plugin-amp-mode-transformer'),
      ]);
    }
    pluginsToApply.push(getReplacePlugin_());
    return pluginsToApply;
  },

  eliminateIntermediateBundles() {
    return [
      require.resolve('./babel-plugins/babel-plugin-transform-prune-namespace'),
    ];
  },

  getReplacePlugin() {
    return getReplacePlugin_();
  },
};
