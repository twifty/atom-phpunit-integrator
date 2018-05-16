/** @babel */
/* global atom Promise */

import { CompositeDisposable, Emitter } from 'atom'
import promisify from 'util.promisify'
import which from 'which'

const whichAsync = promisify(which)

import { isFile } from '../util/php-unit-utils'

async function validateBinary (path) {
    const exists = await isFile(path)

    if (!exists) {
        path = await whichAsync(path)
    }

    return path
}

async function validatePath (path) {
    const exists = await isFile(path)

    if (!exists) {
        throw new Error('ENOENT')
    }

    return path
}

async function validatePaths (paths) {
    if (!Array.isArray(paths)) {
        return validatePath
    }

    const batch = paths.map(validatePath)

    return Promise.all(batch)
}

export default class PhpUnitConfig
{
    /**
     * Migrates old settings into their new namespace
     *
     * @param  {String} key   - The old setting key
     * @param  {Mixed}  value - The old setting value
     */
    static migrate (key, value) {
        let newKey = null

        switch (key) {
            case 'php-unit-integrator.phpCommand':
                newKey = 'shared.php.php-path'
                break
            case 'php-unit-integrator.phpUnitPath':
                newKey = 'php-unit-integrator.phpunit-path'
                break
            case 'php-unit-integrator.alwaysOpen':
                newKey = 'php-unit-integrator.always-open'
                break
            case 'php-unit-integrator.gotoTest':
                newKey = 'php-unit-integrator.goto-test'
                break
            case 'php-unit-integrator.additionalCommandParameters':
                newKey = 'php-unit-integrator.additional-command-parameters'
                break
            case 'php-unit-integrator.openView':
                newKey = 'php-unit-integrator.open-view'
                break
            case 'php-unit-integrator.enableTreeView':
                newKey = 'php-unit-integrator.enable-tree-view'
                break
            case 'php-unit-integrator.errorLines':
                newKey = 'php-unit-integrator.error-lines'
                break
            case 'php-unit-integrator.phpExtensions':
                newKey = 'shared.php.php-extensions'
                break
        }

        if (newKey) {
            atom.config.set(newKey, value)
        }
    }

    /**
     * Constructor
     *
     * @constructor
     */
    constructor () {
        this.emitter = new Emitter()
        this.disposables = new CompositeDisposable()

        this.properties = {}
        this.defaults = {
            'php-path': 'php',
            'php-ini': true,
            'phpunit-path': './vendor/bin/phpunit',
            'always-open': false,
            'goto-test': true,
            'additional-command-parameters': '',
            'open-view': true,
            'enable-tree-view': true,
            'error-lines': 10,
            'php-extensions': [],
        }

        this.validators = {
            'php-path': validateBinary,
            'phpunit-path': validateBinary,
            'php-extensions': validatePaths,
        }

        for (const name of Object.keys(this.defaults)) {
            const value = atom.config.get('php-unit-integrator.' + name)

            if (undefined !== value) {
                this.disposables.add(atom.config.observe('php-unit-integrator.' + name, this.set.bind(this, name)))
            } else {
                this.disposables.add(atom.config.observe('shared.php.' + name, this.set.bind(this, name)))
            }
        }
    }

    /**
     * Destructor
     */
    destroy () {
        this.disposables.dispose()
        this.emitter.dispose()

        this.emitter = null
        this.disposables = null
        this.properties = null
    }

    /**
     * Listens for config property changes
     *
     * @param  {Function} cb - Callback invoked with property name and new value
     *
     * @return {Disposable}
     */
    onDidChange (cb) {
        return this.emitter.on('change', cb)
    }

    /**
     * Retrieves the current value of a property
     *
     * @param  {String} name - The name of the property to fetch
     *
     * @return {mixed}
     */
    get (name) {
        if (name in this.properties) {
            return this.properties[name]
        }

        if (!(name in this.defaults)) {
            console.error(`Accessing unknown setting '${name}', please report!`); // eslint-disable-line
        }

        return this.defaults[name]
    }

    /**
     * Configures a new value for a property
     *
     * NOTE setting undefined will remove the property
     *
     * @param {String} name  - The name of the property to configure
     * @param {mixed}  value - The new value
     */
    set (name, value) {
        if (undefined === value) {
            return this.remove(name)
        }
        if (name in this.validators) {
            this.validators[name].call(null, value).then(updated => {
                this.properties[name] = updated
                this.emitChange(name, updated)
            }, () => {
                // Ignore errors while user is changing values
            })
        } else {
            this.properties[name] = value
            this.emitChange(name, value)
        }
    }

    /**
     * Checks if the property exists
     *
     * @param  {String}  name - The name of the property to check
     *
     * @return {Boolean}
     */
    has (name) {
        return (name in this.properties)
    }

    /**
     * Deletes a property name and value
     *
     * @param  {String}  name - The name of the property to remove
     */
    remove (name) {
        delete this.properties[name]
        this.emitChange(name, undefined)
    }

    /**
     * Invokes the listeners if any are configured
     *
     * @private
     * @param  {String} name  - The modified property name
     * @param  {mixed}  value - The modified property value
     */
    emitChange (name, value) {
        this.emitter.emit('change', {name, value})
    }
}
