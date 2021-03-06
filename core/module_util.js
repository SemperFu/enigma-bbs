/* jslint node: true */
'use strict';

//  ENiGMA½
const Config    = require('./config.js').get;
const Log       = require('./logger.js').log;

//  deps
const fs        = require('graceful-fs');
const paths     = require('path');
const _         = require('lodash');
const assert    = require('assert');
const async     = require('async');
const glob      = require('glob');

//  exports
exports.loadModuleEx            = loadModuleEx;
exports.loadModule              = loadModule;
exports.loadModulesForCategory  = loadModulesForCategory;
exports.getModulePaths          = getModulePaths;
exports.initializeModules       = initializeModules;

function loadModuleEx(options, cb) {
    assert(_.isObject(options));
    assert(_.isString(options.name));
    assert(_.isString(options.path));

    const modConfig = _.isObject(Config[options.category]) ? Config[options.category][options.name] : null;

    if(_.isObject(modConfig) && false === modConfig.enabled) {
        const err   = new Error(`Module "${options.name}" is disabled`);
        err.code    = 'EENIGMODDISABLED';
        return cb(err);
    }

    //
    //  Modules are allowed to live in /path/to/<moduleName>/<moduleName>.js or
    //  simply in /path/to/<moduleName>.js. This allows for more advanced modules
    //  to have their own containing folder, package.json & dependencies, etc.
    //
    let mod;
    let modPath = paths.join(options.path, `${options.name}.js`);   //  general case first
    try {
        mod = require(modPath);
    } catch(e) {
        if('MODULE_NOT_FOUND' === e.code) {
            modPath = paths.join(options.path, options.name, `${options.name}.js`);
            try {
                mod = require(modPath);
            } catch(e) {
                return cb(e);
            }
        } else {
            return cb(e);
        }
    }

    if(!_.isObject(mod.moduleInfo)) {
        return cb(new Error('Module is missing "moduleInfo" section'));
    }

    if(!_.isFunction(mod.getModule)) {
        return cb(new Error('Invalid or missing "getModule" method for module!'));
    }

    return cb(null, mod);
}

function loadModule(name, category, cb) {
    const path = Config().paths[category];

    if(!_.isString(path)) {
        return cb(new Error(`Not sure where to look for "${name}" of category "${category}"`));
    }

    loadModuleEx( { name : name, path : path, category : category }, function loaded(err, mod) {
        return cb(err, mod);
    });
}

function loadModulesForCategory(category, iterator, complete) {

    fs.readdir(Config().paths[category], (err, files) => {
        if(err) {
            return iterator(err);
        }

        const jsModules = files.filter(file => {
            return '.js' === paths.extname(file);
        });

        async.each(jsModules, (file, next) => {
            loadModule(paths.basename(file, '.js'), category, (err, mod) => {
                iterator(err, mod);
                return next();
            });
        }, err => {
            if(complete) {
                return complete(err);
            }
        });
    });
}

function getModulePaths() {
    const config = Config();
    return [
        config.paths.mods,
        config.paths.loginServers,
        config.paths.contentServers,
        config.paths.scannerTossers,
    ];
}

function initializeModules(cb) {
    const Events = require('./events.js');

    const modulePaths = getModulePaths().concat(__dirname);

    async.each(modulePaths, (modulePath, nextPath) => {
        glob('*{.js,/*.js}', { cwd : modulePath }, (err, files) => {
            if(err) {
                return nextPath(err);
            }

            const ourPath = paths.join(__dirname, __filename);

            async.each(files, (moduleName, nextModule) => {
                const fullModulePath = paths.join(modulePath, moduleName);
                if(ourPath === fullModulePath) {
                    return nextModule(null);
                }

                try {
                    const mod = require(fullModulePath);

                    if(_.isFunction(mod.moduleInitialize)) {
                        const initInfo = {
                            events : Events,
                        };

                        mod.moduleInitialize(initInfo, err => {
                            if(err) {
                                Log.warn( { error : err.message, modulePath : fullModulePath }, 'Error during "moduleInitialize"');
                            }
                            return nextModule(null);
                        });
                    } else {
                        return nextModule(null);
                    }
                } catch(e) {
                    Log.warn( { error : e }, 'Exception during "moduleInitialize"');
                    return nextModule(null);
                }
            },
            err => {
                return nextPath(err);
            });
        });
    },
    err => {
        return cb(err);
    });
}
