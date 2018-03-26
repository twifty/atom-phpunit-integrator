/** @babel */
/* global atom */

import { CompositeDisposable, Disposable } from 'atom';

import PhpUnitProjectManager from './project/php-unit-project-manager'
import PhpUnitStatusBarView from './views/php-unit-status-bar-view'
import PhpUnitIntegratorView from './views/php-unit-integrator-view'
import PhpUnitSkelgen from './skelgen/php-skelgen-observer'

export default {
  view: null,
  tile: null,
  subscriptions: null,
  manager: null,

  activate (/*state*/) {
    this.subscriptions = new CompositeDisposable()

    this.subscriptions.add(atom.commands.add('atom-workspace', {
      'php-unit-integrator:toggle': this.toggle.bind(this)
    }))

    this.subscriptions.add(atom.workspace.onDidOpen(event => {
      if (event.uri === 'php-unit-integrator' && this.tile) {
        this.tile.setActive(true)
        this.view = event.item
      }
    }))

    this.subscriptions.add(atom.workspace.onWillDestroyPaneItem(event => {
      if (event.item === this.view) {
        this.tile.setActive(false)
        this.view = null
      }
    }))

    this.subscriptions.add(atom.workspace.onDidChangeActivePaneItem(item => {
      this.tile.setActive(this.view && item === this.view)
    }))

    this.manager = new PhpUnitProjectManager(this.getOptions())

    this.toggle()
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

  toggle () {
    if (this.view) {
      atom.workspace.toggle(this.view)
    } else {
      atom.workspace.open(new PhpUnitIntegratorView(this.manager, this.getOptions()))
    }
  },

  consumeStatusBar (statusBar) {
    this.tile = new PhpUnitStatusBarView(statusBar)
    this.subscriptions.add(this.tile.onDidClick(this.toggle.bind(this)))

    // return new Disposable(() => {
    //   this.tile.destroy()
    //   this.tile = null
    // })
  },

  consumeIntegrator (integrator) {
    this.skelgen = new PhpUnitSkelgen(integrator)

    // return new Disposable()
  },

  getOptions () {
    return {}
  }

};
