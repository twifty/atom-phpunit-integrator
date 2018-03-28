/** @babel */
/* global atom */

import { CompositeDisposable } from 'atom';

import PhpUnitProjectManager from './project/php-unit-project-manager'
import PhpUnitStatusBarView from './views/php-unit-status-bar-view'
import PhpUnitIntegratorView from './views/php-unit-integrator-view'
import PhpUnitSkelgen from './skelgen/php-skelgen-observer'

import IntegratorService from './skelgen/php-skelgen-proxy'

export default {
  view: null,
  tile: null,
  subscriptions: null,
  manager: null,

  activate (state) {
    this.state = state || {}
    this.subscriptions = new CompositeDisposable()

    this.subscriptions.add(atom.commands.add('atom-workspace', {
      'php-unit-integrator:toggle': this.toggle.bind(this)
    }))

    this.subscriptions.add(atom.workspace.onDidOpen(event => {
      if (event.item === this.view) {
        this.active = true
        this.tile.setActive(true)
      }
    }))

    this.subscriptions.add(atom.workspace.onWillDestroyPaneItem(event => {
      if (event.item === this.view) {
        this.tile.setActive(false)
        this.view.destroy()
        this.view = null
        this.active = false
      }
    }))

    this.subscriptions.add(atom.workspace.onDidChangeActivePaneItem(item => {
      if (this.view) {
        this.active = item === this.view
        this.tile.setActive(this.active)
      }
    }))

    this.manager = new PhpUnitProjectManager(this.getOptions())

    const integratorBasePath = atom.packages.resolvePackagePath('php-integrator-base')

    if (integratorBasePath) {
      this.skelgen = new PhpUnitSkelgen(new IntegratorService(integratorBasePath))
    }

    if (state.active) {
      this.toggle()
    }
  },

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

  serialize () {
    const state = {
      active: this.active
    }

    if (this.view) {
      state.view = this.view.getState()
    }

    return state
  },

  toggle () {
    if (this.view) {
      atom.workspace.toggle(this.view)
    } else {
      this.view = new PhpUnitIntegratorView(this.manager, this.getOptions(), this.state && this.state.view)
      atom.workspace.open(this.view)
    }
  },

  consumeStatusBar (statusBar) {
    this.tile = new PhpUnitStatusBarView(statusBar)
    this.subscriptions.add(this.tile.onDidClick(this.toggle.bind(this)))
  },

  // consumeIntegrator (integrator) {
  //   this.skelgen = new PhpUnitSkelgen(integrator)
  //
  //   // return new Disposable()
  // },

  getOptions () {
    return {}
  }

};
