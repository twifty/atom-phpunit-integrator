/** @babel */
/* global atom */

import {CompositeDisposable, Emitter} from 'atom'

export default class PhpUnitConfig
{
  /**
   * Constructor
   *
   * @constructor
   */
  constructor () {
    this.emitter = null
    this.disposables = new CompositeDisposable()
    this.useIntegratorBase = true
    this.properties = {}
    this.defaults = {
      phpCommand: 'php',
      phpUnitPath: './vendor/bin/phpunit',
    }

    this.baseObserver = atom.config.observe('php-unit-integrator.useIntegratorBase', this.load.bind(this))
  }

  /**
   * Destructor
   */
  destroy () {
    this.baseObserver.dispose()
    this.disposables.dispose()

    this.baseObserver = null
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
    if (!this.emitter) {
      this.emitter = new Emitter()
    }

    return this.emitter.on('changed', cb)
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

    this.properties[name] = value
    this.emitChange(name, value)
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
    if (this.emitter) {
      this.emitter.emit('change', {
        name,
        value
      })
    }
  }

  /**
   * Populates the properties with those in the settings manager
   *
   * @private
   * @param  {Boolean} fromIntegratorBase - True to indicate loading from php-integrator-base
   */
  load (fromIntegratorBase) {
    let configPath = 'php-unit-integrator.'

    if (fromIntegratorBase) {
      const integratorBasePath = atom.packages.resolvePackagePath('php-integrator-base')

      if (integratorBasePath && !atom.packages.isPackageDisabled('php-integrator-base')) {
        configPath = 'php-integrator-base.core.'
      }
    }

    this.disposables.dispose()
    this.disposables = new CompositeDisposable()

    for (const name of Object.keys(this.defaults)) {
      const value = atom.config.get(configPath + name)

      if (undefined === value && 'php-integrator-base.core.' === configPath) {
        this.disposables.add(atom.config.observe('php-unit-integrator.' + name, this.set.bind(this, name)))
      } else {
        this.disposables.add(atom.config.observe(configPath + name, this.set.bind(this, name)))
      }
    }
  }
}
