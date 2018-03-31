/** @babel */
/* global atom */

import {Emitter, CompositeDisposable} from 'atom'

/**
 * Utility for managing workspace events for a view
 */
export default class ViewObserver
{
  /**
   * Constructor
   *
   * @constructor
   */
  constructor () {
    this.view = null
    this.emitter = new Emitter()
    this.workspaceObservers = null
    this.dockObserver = null

    this.dockVisible = false
    this.viewVisible = false
    this.viewActive = false
  }

  /**
   * Destructor
   */
  destroy () {
    this.dispose()

    this.emitter.dispose()
    this.emitter = null
  }

  /**
   * Clears all internal listeners and disassociates the view
   */
  dispose () {
    if (this.workspaceObservers) {
      this.workspaceObservers.dispose()
      this.workspaceObservers = null
    }

    if (this.dockObserver) {
      this.dockObserver.dispose()
      this.dockObserver = null
    }

    this.view = null
    this.pane = null
    this.panel = null
    this.dock = null
  }

  /**
   * Begins observing the view in the workspace
   *
   * This is safe to call before adding the view to the workspace.
   *
   * @param  {View} view - The view within the workspace
   */
  observe (view) {
    this.dispose()

    if (!view) {
      return
    }

    this.view = view
    this.pane = atom.workspace.paneForItem(this.view)
    this.panel = atom.workspace.panelForItem(this.view)
    this.dock = atom.workspace.paneContainerForItem(this.view)

    this.workspaceObservers = new CompositeDisposable()

    this.workspaceObservers.add(atom.workspace.observeActivePaneItem((item) => {
      const active = item === this.view

      this.updateActive(active)
      this.updateDock(atom.workspace.paneContainerForItem(this.view))
      this.updatePane(atom.workspace.paneForItem(this.view))

      if (active) {
        this.updateVisibility(true)
      } else if (this.pane && this.view === this.pane.getActiveItem()) {
        // still the active item, but the containing dock may be hidden
        this.updateVisibility(this.dockVisible)
      } else {
        // Either we don't have a pane or we are not active.
        this.updateVisibility(false)
      }
    }))

    this.workspaceObservers.add(atom.workspace.onWillDestroyPaneItem(({item}) => {
      if (item === this.view) {
        this.emitter.emit('will-destroy', item)
        this.dispose()
      }
    }))
  }

  /**
   * Checks if the view is visible to the user
   *
   * @return {Boolean}
   */
  isVisible () {
    return this.viewVisible
  }

  /**
   * Checks if the view has focus
   *
   * @return {Boolean}
   */
  isActive () {
    return this.viewActive
  }

  /**
   * Invokes the callback when the view is about to be destroyed
   *
   * @param  {Function} cb - The handler
   *
   * @return {Disposable}
   */
  onWillDestroy (cb) {
    return this.emitter.on('will-destroy', cb)
  }

  /**
   * Invokes the callback when the view changes panes
   *
   * @param  {Function} cb - The handler
   *
   * @return {Disposable}
   */
  onChangedPane (cb) {
    return this.emitter.on('pane-changed', cb)
  }

  /**
   * Invokes the callback when the view changes docks
   *
   * @param  {Function} cb - The handler
   *
   * @return {Disposable}
   */
  onChangedDock (cb) {
    return this.emitter.on('dock-changed', cb)
  }

  /**
   * Invokes the callback when the view changes visibility
   *
   * @param  {Function} cb - The handler
   *
   * @return {Disposable}
   */
  onChangedVisibility (cb) {
    return this.emitter.on('visibility-changed', cb)
  }

  /**
   * Invokes the callback when the view changes focus
   *
   * @param  {Function} cb - The handler
   *
   * @return {Disposable}
   */
  onChangedActive (cb) {
    return this.emitter.on('active-changed', cb)
  }

  /**
   * Tracks the views containing dock
   *
   * @param  {Dock|WorkspaceCenter} dock - The new dock
   */
  updateDock (dock) {
    if (dock !== this.dock) {
      this.dock = dock

      if (this.dockObserver) {
        this.dockObserver.dispose()
        this.dockObserver = null
      }

      if ('Dock' === this.dock.constructor.name) {
        this.dockObserver = this.dock.observeVisible(visible => {
          this.dockVisible = visible
          this.updateVisibility(visible)
        })
      } else {
        this.dockVisible = true
        this.updateVisibility(true)
      }

      this.emitter.emit('dock-changed', dock)
    }
  }

  /**
   * Tracks changes to the views pane
   *
   * @param  {Pane} pane - The new pane
   */
  updatePane (pane) {
    if (pane !== this.pane) {
      this.pane = pane
      this.emitter.emit('pane-changed', pane)
    }
  }

  /**
   * Tracks changes to the views visibility
   *
   * @param  {Boolean} visible - The visible state
   */
  updateVisibility (visible) {
    if (visible !== this.viewVisible) {
      this.viewVisible = visible
      this.emitter.emit('visibility-changed', this.viewVisible)
    }
  }

  /**
   * Tracks changes to the views active state
   *
   * @param  {Boolean} active - The active state
   */
  updateActive (active) {
    if (active !== this.viewActive) {
      this.viewActive = active
      this.emitter.emit('active-changed', this.viewActive)
    }
  }
}
