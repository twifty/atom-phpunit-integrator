/** @babel */
/* global atom */

import {CompositeDisposable} from 'atom';

import PhpUnitStatusBarView from './views/php-unit-status-bar-view'
import PhpUnitIntegratorView from './views/php-unit-integrator-view'
import PhpUnitTreeView from './views/php-unit-tree-view'
import PhpUnitCoverageMarkers from './markers/php-unit-coverage-markers'
import ViewObserver from './util/view-observer'
import PhpCoreService from './proxy/php-core-service'
import PhpUnitWorkspace from './workspace/php-unit-workspace'

export default class PhpUnitIntegrator
{
    /**
     * Constructor
     *
     * @constructor
     */
    constructor () {
        this.subscriptions = new CompositeDisposable()
        this.markerLayer = new PhpUnitCoverageMarkers(this.getWorkspace())

        this.view = null
        this.tile = null
    }

    /**
     * Activates the package with the previous state
     *
     * @param  {Object} state - The previous result of @see {@link serialize}
     */
    activate (state) {
        this.state = state

        this.subscriptions.add(atom.commands.add('atom-workspace', {'php-unit-integrator:toggle': () => {
            this.toggle()
        }}))

        const tester = this.getWorkspace().getProjectTester()

        this.subscriptions.add(tester.onDidBeginTest(() => {
            this.show()
        }))

        this.consumeIntegratorBase()
        this.consumeTreeView()
        this.observeView()

        if (true === this.getWorkspace().getPackageConfig().get('alwaysOpen')) {
            this.show()
        }
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

        this.subscriptions.dispose()
        this.subscriptions = null
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
        this.subscriptions.add(this.tile.onDidClick(this.toggle.bind(this)))

        this.tile.setActive(this.getViewObserver().isVisible())
    }

    /**
     * Loads the `php-integrator-base` package
     *
     * @private
     */
    consumeIntegratorBase () {
        // TODO use activatePackage or revert back to consuming actual service
        const integratorBasePath = atom.packages.resolvePackagePath('php-integrator-base')

        if (integratorBasePath) {
            const coreService = new PhpCoreService(integratorBasePath)

            this.getWorkspace().setCoreService(coreService)
        }
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

    /**
     * Handles changes to the views display
     *
     * @private
     */
    observeView () {
        const viewObserver = this.getViewObserver()

        this.subscriptions.add(viewObserver.onChangedVisibility(visible => {
            this.active = visible
            this.tile.setActive(visible)
        }))

        this.subscriptions.add(viewObserver.onChangedDock((dock) => {
            let orientation = 'horizontal'
            if (-1 !== ['left', 'right'].indexOf(dock.location)) {
                orientation = 'vertical'
            }

            this.view.update({orientation})
        }))

        this.subscriptions.add(viewObserver.onWillDestroy(() => {
            this.tile.setActive(false)
            this.view.destroy()
            this.view = null
            this.active = false
        }))
    }
}
