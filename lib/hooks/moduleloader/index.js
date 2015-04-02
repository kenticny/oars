module.exports = function(oars) {


  /**
   * Module dependencies
   */

  var path = require('path');
  var async = require('async');
  var _ = require('lodash');
  var buildDictionary = require('sails-build-dictionary');


  // TODO:
  // Look at improving `includeAll` to work asynchronously
  // CommonJS `require` is a blocking operation, and makes apps
  // start slower.



  /**
   * Module loader
   *
   * Load a module into memory
   */
  return {


    // Default configuration
    defaults: function (config) {

      // TODO:
      // lazy-load (i.e. only do this if a `.coffee` file is encountered), e.g.
      // if (filepath.match(/\.coffee$/)) {}

      // TODO:
      // negotiate the error-- if it's NOT a require error, log it directly.
      // if it IS, display the error we have currently
      // (the only reason it's verbose right now is that if you're NOT using coffeescript
      //  it's pretty annoying to see the error pop up every time-- see previous todo)

      // Enable server-side CoffeeScript support
      try {
        require('coffee-script/register');
      } catch(e0){
        try {
          var appPath = config.appPath || process.cwd();
          require(path.join(appPath, 'node_modules/coffee-script/register'));
        }
        catch (e1) {
          oars.log.verbose('Please run `npm install coffee-script` to use coffescript (skipping for now)');
          oars.log.silly('Here\'s the require error(s): ',e0,e1);
        }
      }

      return {

        // The path to the application
        appPath: config.appPath ? path.resolve(config.appPath) : process.cwd(),

        // Paths for application modules and key files
        // If `paths.app` not specified, use process.cwd()
        // (the directory where this Oars process is being initiated from)
        paths: {

          // Configuration
          //
          // For `userconfig` hook
          config: path.resolve(config.appPath, 'config'),

          // Server-Side Code
          //
          // For `controllers` hook
          controllers: path.resolve(config.appPath, 'api/controllers'),
          // For `policies` hook
          policies: path.resolve(config.appPath, 'api/policies'),
          // For `services` hook
          services: path.resolve(config.appPath, 'api/services'),
          // For `userhooks` hook
          hooks: path.resolve(config.appPath, 'api/hooks'),
          // For `responses` hook
          responses: path.resolve(config.appPath, 'api/responses'),

        }
      };
    },


    initialize: function(cb) {

      // Expose self as `oars.modules` (for backwards compatibility)
      oars.modules = oars.hooks.moduleloader;

      return cb();
    },

    configure: function() {
      if (oars.config.moduleLoaderOverride) {
        var override = oars.config.moduleLoaderOverride(oars, this);
        oars.util.extend(this, override);
        if (override.configure) {
          this.configure();
        }
      }
      // console.log('Trying to use appPath:',oars.config.appPath);
      // console.log('Trying to use config dir at:',path.resolve(oars.config.appPath, 'config'));
      oars.config.appPath = oars.config.appPath ? path.resolve(oars.config.appPath) : process.cwd();

      _.extend(oars.config.paths, {

        // Configuration
        //
        // For `userconfig` hook
        config: path.resolve(oars.config.appPath, oars.config.paths.config),

        // Server-Side Code
        //
        // For `controllers` hook
        controllers: path.resolve(oars.config.appPath, oars.config.paths.controllers),
        // For `policies` hook
        policies: path.resolve(oars.config.appPath, oars.config.paths.policies),
        // For `services` hook
        services: path.resolve(oars.config.appPath, oars.config.paths.services),
        // For `userhooks` hook
        hooks: path.resolve(oars.config.appPath, oars.config.paths.hooks),
        // For `responses` hook
        responses: path.resolve(oars.config.appPath, oars.config.paths.responses)
      });
    },

    /**
     * Load user config from app
     *
     * @param {Object} options
     * @param {Function} cb
     */
    loadUserConfig: function (cb) {

      async.auto({

        'config/*': function loadOtherConfigFiles (cb) {
          // console.log('TRYING T LOAD CONFIG AT:',oars.config.paths.config);
          buildDictionary.aggregate({
            dirname   : oars.config.paths.config || oars.config.appPath + '/config',
            exclude   : ['locales', 'local.js', 'local.json', 'local.coffee', 'local.litcoffee'],
            excludeDirs: /(locales|env)$/,
            filter    : /(.+)\.(js|json|coffee|litcoffee)$/,
            identity  : false
          }, cb);
        },


        'config/local' : function loadLocalOverrideFile (cb) {
          buildDictionary.aggregate({
            dirname   : oars.config.paths.config || oars.config.appPath + '/config',
            filter    : /local\.(js|json|coffee|litcoffee)$/,
            identity  : false
          }, cb);
        },


        'config/env/*' : ['config/local', function loadLocalOverrideFile (cb, async_data) {
          // If there's an environment already set in oars.config, then it came from the environment
          // or the command line, so that takes precedence.  Otherwise, check the config/local.js file
          // for an environment setting.  Lastly, default to development.
          var env = oars.config.environment || async_data['config/local'].environment || 'development';
          buildDictionary.aggregate({
            dirname   : (oars.config.paths.config || oars.config.appPath + '/config') + '/env',
            filter    : new RegExp(env + '.(js|json|coffee|litcoffee)$'),
            optional  : true,
            identity  : false
          }, cb);
        }]

      }, function (err, async_data) {
        if (err) return cb(err);
        // Save the environment override, if any.
        var env = oars.config.environment;
        // Merge the configs, with env/*.js files taking precedence over others, and local.js
        // taking precedence over everything
        var config = oars.util.merge(
          async_data['config/*'],
          async_data['config/env/*'],
          async_data['config/local']
        );
        // Set the environment, but don't allow env/* files to change it; that'd be weird.
        config.environment = env || async_data['config/local'].environment || 'development';
        // Return the user config
        cb(null, config);
      });
    },



    /**
     * Load app controllers
     *
     * @param {Object} options
     * @param {Function} cb
     */
    loadControllers: function (cb) {
      buildDictionary.optional({
        dirname: oars.config.paths.controllers,
        filter: /(.+)Controller\.(js|coffee|litcoffee)$/,
        flattenDirectories: true,
        keepDirectoryPath: true,
        replaceExpr: /Controller/
      }, cb);
    },




    /**
     * Load adapters
     *
     * @param {Object} options
     * @param {Function} cb
     */
    loadAdapters: function (cb) {
      buildDictionary.optional({
        dirname   : oars.config.paths.adapters,
        filter    : /(.+Adapter)\.(js|coffee|litcoffee)$/,
        replaceExpr : /Adapter/,
        flattenDirectories: true
      }, cb);
    },




    /**
     * Load app's model definitions
     *
     * @param {Object} options
     * @param {Function} cb
     */
    loadModels: function (cb) {
      // Get the main model files
      buildDictionary.optional({
        dirname   : oars.config.paths.models,
        filter    : /^([^.]+)\.(js|coffee|litcoffee)$/,
        replaceExpr : /^.*\//,
        flattenDirectories: true
      }, function(err, models) {
        if (err) {return cb(err);}
        // Get any supplemental files
        buildDictionary.optional({
          dirname   : oars.config.paths.models,
          filter    : /(.+)\.attributes.json$/,
          replaceExpr : /^.*\//,
          flattenDirectories: true
        }, function(err, supplements) {
          if (err) {return cb(err);}
          return cb(null, oars.util.merge(models, supplements));
        });
      });
    },





    /**
     * Load app services
     *
     * @param {Object} options
     * @param {Function} cb
     */
    loadServices: function (cb) {
      buildDictionary.optional({
        dirname     : oars.config.paths.services,
        filter      : /(.+)\.(js|coffee|litcoffee)$/,
        depth     : 1,
        caseSensitive : true
      }, cb);
    },



    /**
     * Check for the existence of views in the app
     *
     * @param {Object} options
     * @param {Function} cb
     */
    statViews: function (cb) {
      buildDictionary.optional({
        dirname: oars.config.paths.views,
        filter: /(.+)\..+$/,
        replaceExpr: null,
        dontLoad: true
      }, cb);
    },



    /**
     * Load app policies
     *
     * @param {Object} options
     * @param {Function} cb
     */
    loadPolicies: function (cb) {
      buildDictionary.optional({
        dirname: oars.config.paths.policies,
        filter: /(.+)\.(js|coffee|litcoffee)$/,
        replaceExpr: null,
        flattenDirectories: true,
        keepDirectoryPath: true
      }, cb);
    },



    /**
     * Load app hooks
     *
     * @param {Object} options
     * @param {Function} cb
     */
    loadUserHooks: function (cb) {
      buildDictionary.optional({
        dirname: oars.config.paths.hooks,
        filter: /^(.+)\.(js|coffee|litcoffee)$/,

        // Hooks should be defined as either single files as a function
        // OR (better yet) a subfolder with an index.js file
        // (like a standard node module)
        depth: 2
      }, cb);
    },



    /**
     * Load app blueprint middleware.
     *
     * @param {Object} options
     * @param {Function} cb
     */
    loadBlueprints: function (cb) {
      buildDictionary.optional({
        dirname: oars.config.paths.blueprints,
        filter: /(.+)\.(js|coffee|litcoffee)$/,
        useGlobalIdForKeyName: true
      }, cb);
    },



    /**
     * Load custom API responses.
     *
     * @param {Object} options
     * @param {Function} cb
     */
    loadResponses: function (cb) {
      buildDictionary.optional({
        dirname: oars.config.paths.responses,
        filter: /(.+)\.(js|coffee|litcoffee)$/,
        useGlobalIdForKeyName: true
      }, cb);
    },

    optional: buildDictionary.optional,
    required: buildDictionary.required,
    aggregate: buildDictionary.aggregate,
    exits: buildDictionary.exists

  };

};