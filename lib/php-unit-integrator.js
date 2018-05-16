/** @babel */
/* global atom */

import {CompositeDisposable} from 'atom'
import installPackage from 'atom-package-deps'
import blitz from 'atom-blitz-settings'

import PhpUnitConfig from './workspace/php-unit-config'
import PhpUnitStatusBarView from './views/php-unit-status-bar-view'
import PhpUnitIntegratorView from './views/php-unit-integrator-view'
import PhpUnitTreeView from './views/php-unit-tree-view'
import PhpUnitCoverageMarkers from './markers/php-unit-coverage-markers'
import ViewObserver from './util/view-observer'
import PhpUnitWorkspace from './workspace/php-unit-workspace'

export default class PhpUnitIntegrator
{
    /**
     * Constructor
     *
     * @constructor
     */
    constructor () {
        this.markerLayer = new PhpUnitCoverageMarkers(this.getWorkspace())

        this.subscriptions = null
        this.view = null
        this.tile = null
    }

    /**
     * Activates the package with the previous state
     *
     * @param  {Object} state - The previous result of @see {@link serialize}
     */
    activate (state) {
        blitz('php-unit-integrator', PhpUnitConfig.migrate)

        return installPackage('php-unit-integrator', true).then(() => {
            this.state = state

            const subscriptions = this.getSubscriptions()

            subscriptions.add(atom.commands.add('atom-workspace', {'php-unit-integrator:toggle': () => {
                this.toggle()
            }}))

            const tester = this.getWorkspace().getProjectTester()

            subscriptions.add(tester.onDidBeginTest(() => {
                this.show()
            }))

            this.consumeTreeView()
            this.observeView()

            if (true === this.getWorkspace().getPackageConfig().get('always-open')) {
                this.show()
            }
        })
    }

    /**
     * Returns the serialized state of any components
     *
     * @return {Object}
     */
    serialize () {
        const meta = {}

        if (this.tree) {
            meta.tree = this.tree.serialize()
        }

        return meta
    }

    /**
     * Deactivates the project before destroying
     *
     * @return {Promise}
     */
    async deactivate () {
        if (this.view) {
            const pane = atom.workspace.paneForItem(this.view)
            pane.destroyItem(this.view)
            this.view = null
        }

        if (this.tile) {
            this.tile.destroy()
            this.tile = null
        }

        if (this.subscriptions) {
            this.subscriptions.dispose()
            this.subscriptions = null
        }
    }

    /**
     * Renders shows and/or hides the view
     */
    toggle () {
        if (this.view) {
            atom.workspace.toggle(this.view)
        } else {
            this.show()
        }
    }

    /**
     * Opens the view
     *
     * @return {Promise}
     */
    show () {
        return atom.workspace.open(this.createIntegratorView())
    }

    /**
     * deserializer method, creates the view
     *
     * @param  {Object} state      - The state returned from PhpIntegratorView.serialize
     *
     * @return {PhpIntegratorView} - A new or existing instance
     */
    createIntegratorView (state) {
        if (!this.view) {
            this.view = new PhpUnitIntegratorView(this.getWorkspace(), state)

            this.getViewObserver().observe(this.view)

            if (this.tile) {
                this.tile.setActive(this.getViewObserver().isVisible())
            }
        }

        return this.view
    }

    /**
     * Adds an entry into the atom status bar
     *
     * @param  {Object} statusBar - The status bar service
     */
    consumeStatusBar (statusBar) {
        this.tile = new PhpUnitStatusBarView(statusBar)
        this.getSubscriptions().add(this.tile.onDidClick(this.toggle.bind(this)))

        this.tile.setActive(this.getViewObserver().isVisible())
    }

    /**
     * Loads the `tree-view` package and attaches a view
     *
     * @private
     */
    consumeTreeView () {
        atom.packages.activatePackage('tree-view').then((pkg) => {
            if (pkg && pkg.mainModule && pkg.mainModule.treeView) {
                this.tree = new PhpUnitTreeView(this.getWorkspace(), pkg.mainModule.treeView)

                if (this.state && this.state.tree) {
                    this.tree.deserialize(this.state.tree)
                }
            }
        }, (reason) => {
            atom.notifications.addWarning("Failed to load the 'tree-view' package.", {
                description: reason.message
            });
        });
    }

    /**
     * Returns the package workspace
     *
     * @return {PhpUnitWorkspace}
     */
    getWorkspace () {
        if (!this.workspace) {
            this.workspace = new PhpUnitWorkspace()
        }

        return this.workspace
    }

    /**
     * Creates and/or returns the view observer
     *
     * @return {ViewObserver}
     */
    getViewObserver () {
        if (!this.viewObserver) {
            this.viewObserver = new ViewObserver()
        }

        return this.viewObserver
    }

    getSubscriptions () {
        if (!this.subscriptions) {
            this.subscriptions = new CompositeDisposable()
        }

        return this.subscriptions
    }

    /**
     * Handles changes to the views display
     *
     * @private
     */
    observeView () {
        const viewObserver = this.getViewObserver()
        const subscriptions = this.getSubscriptions()

        subscriptions.add(viewObserver.onChangedVisibility(visible => {
            this.active = visible
            this.tile.setActive(visible)
        }))

        subscriptions.add(viewObserver.onChangedDock((dock) => {
            let orientation = 'horizontal'
            if (-1 !== ['left', 'right'].indexOf(dock.location)) {
                orientation = 'vertical'
            }

            this.view.update({orientation})
        }))

        subscriptions.add(viewObserver.onWillDestroy(() => {
            this.tile.setActive(false)
            this.view.destroy()
            this.view = null
            this.active = false
        }))
    }
}
