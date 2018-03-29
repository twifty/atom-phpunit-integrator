/** @babel */
/* global atom */

import { CompositeDisposable } from 'atom';

import PhpUnitProjectManager from './project/php-unit-project-manager'
import PhpUnitStatusBarView from './views/php-unit-status-bar-view'
import PhpUnitIntegratorView from './views/php-unit-integrator-view'
import PhpUnitSkelgen from './skelgen/php-skelgen-observer'
import PhpUnitConfig from './config/php-unit-config'
import ViewObserver from './util/view-observer'

import IntegratorService from './skelgen/php-skelgen-proxy'

export default {
  view: null,
  tile: null,
  subscriptions: null,
  manager: null,

  config: {
    useIntegratorBase: {
      title: 'Use PHP Integrator Base Settings',
      description: 'When installed alongside the PHP Integrator Base package, keep settings in one place.',
      type: 'boolean',
      default: true,
      order: 0,
    },
    phpCommand: {
      title: 'PHP command',
      description: 'The path to your PHP binary (e.g. /usr/bin/php, php, ...).',
      type: 'string',
      default: 'php',
      order: 1,
    },
    phpUnitPath: {
      title: 'Path to phpunit',
      description: 'The path to your phpunit binary (e.g. /usr/bin/phpunit, phpunit, ...).',
      type: 'string',
      default: './vendor/bin/phpunit',
      order: 2,
    },
    autoOpen: {
      title: 'Auto Open',
      description: 'Open panel when opening the editor.',
      type: 'boolean',
      default: false,
      order: 3,
    },
  },

  /**
   * Activates the package with the previous state
   *
   * @param  {Object} state - The previous result of @see {@link serialize}
   */
  activate (state) {
    this.state = state || {}
    this.subscriptions = new CompositeDisposable()
    this.viewObserver = new ViewObserver()
    this.manager = new PhpUnitProjectManager(this.getConfig())

    this.subscriptions.add(atom.commands.add('atom-workspace', {
      'php-unit-integrator:toggle': this.toggle.bind(this)
    }))

    this.subscriptions.add(this.viewObserver.onChangedVisibility(visible => {
      this.active = visible
      this.tile.setActive(visible)
    }))

    this.subscriptions.add(this.viewObserver.onWillDestroy(() => {
      this.tile.setActive(false)
      this.view.destroy()
      this.view = null
      this.active = false
    }))

    const integratorBasePath = atom.packages.resolvePackagePath('php-integrator-base')

    if (integratorBasePath) {
      this.skelgen = new PhpUnitSkelgen(new IntegratorService(integratorBasePath))
    }

    if (true === this.getConfig().get('autoOpen')) {
      this.toggle()
    }
  },

  /**
   * Deactivates the project before destroying
   *
   * @return {Promise}
   */
  async deactivate () {
    if (this.view) {
      const pane = atom.workspace.paneForItem(this.view)
      await pane.destroyItem(this.view)
    }

    this.subscriptions.dispose()
    this.tile.destroy()

    this.tile = null
    this.view = null
  },

  /**
   * Returns the package state ready for next activation
   *
   * @return {Object} - A JSON serializable object
   */
  serialize () {
    const state = {}

    if (this.view) {
      state.view = this.view.getState()
    }

    return state
  },

  /**
   * Renders shows and/or hides the view
   */
  toggle () {
    if (this.view) {
      atom.workspace.toggle(this.view)
    } else {
      this.view = new PhpUnitIntegratorView(this.manager, this.getConfig(), this.state && this.state.view)
      this.viewObserver.observe(this.view)
      atom.workspace.open(this.view)
    }
  },

  /**
   * Adds an entry into the atom status bar
   *
   * @param  {Object} statusBar - The status bar service
   */
  consumeStatusBar (statusBar) {
    this.tile = new PhpUnitStatusBarView(statusBar)
    this.subscriptions.add(this.tile.onDidClick(this.toggle.bind(this)))
  },

  // consumeIntegrator (integrator) {
  //   this.skelgen = new PhpUnitSkelgen(integrator)
  //
  //   // return new Disposable()
  // },

  /**
   * Returns package options
   *
   * Currently there are no options available
   *
   * @return {Object}
   */
  getConfig () {
    if (!this.configuration) {
      this.configuration = new PhpUnitConfig()
    }

    return this.configuration
  }

};
