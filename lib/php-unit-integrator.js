/** @babel */
/* global atom document */

import {CompositeDisposable} from 'atom';

import PhpUnitStatusBarView from './views/php-unit-status-bar-view'
import PhpUnitIntegratorView from './views/php-unit-integrator-view'
import PhpUnitTreeView from './views/php-unit-tree-view'
import PhpUnitCoverageMarkers from './markers/php-unit-coverage-markers'
import PhpUnitConfig from './config/php-unit-config'
import ViewObserver from './util/view-observer'
import PhpCoreService from './proxy/php-core-service'
import PhpUnitTestRunner from './tester/php-unit-test-runner'

export default class PhpUnitIntegrator
{
	/**
	 * Constructor
	 *
	 * @constructor
	 */
	constructor () {
		this.subscriptions = new CompositeDisposable()
		this.markerLayer = new PhpUnitCoverageMarkers(this.getTester())

		this.view = null
		this.tile = null
		this.manager = null
	}

	/**
	 * Activates the package with the previous state
	 *
	 * @param  {Object} state - The previous result of @see {@link serialize}
	 */
	activate () {
		this.subscriptions.add(atom.commands.add('atom-workspace', {'php-unit-integrator:toggle': () => {
			this.toggle()
		}}))

		this.subscriptions.add(atom.commands.add("atom-text-editor[data-grammar='text html php']", {
			'php-unit-integrator:run-test-suite': this.onRunTestCommand.bind(this, 'suite'),
			'php-unit-integrator:run-test-file': this.onRunTestCommand.bind(this, 'file'),
			"php-unit-integrator:run-test-all-suites": this.onRunTestCommand.bind(this, 'all-suites'),
			"php-unit-integrator:run-test-all-files": this.onRunTestCommand.bind(this, 'all-files'),
			"php-unit-integrator:run-test-class": this.onRunTestCommand.bind(this, 'class'),
			"php-unit-integrator:run-test-method": this.onRunTestCommand.bind(this, 'method'),
		}))

		this.consumeIntegratorBase()
		this.consumeTreeView()
		this.observeView()

		if (true === this.getConfig().get('alwaysOpen')) {
			this.show()
		}
	}

	/**
	 * Handler for the keyboard shortcut commands
	 *
	 * @param  {String} which - The test type being run
	 */
	onRunTestCommand (which) {
		const active = document.activeElement

		this.show().then(() => {
			active.focus()

			switch (which) {
				case 'suite':
					return this.tester.runTestSuite()
				case 'all-suites':
					return this.tester.runAllTestSuites()
				case 'file':
					return this.tester.runTestFile()
				case 'all-files':
					return this.tester.runAllTestFiles()
				case 'class':
					return this.tester.runTestClass()
				case 'method':
					return this.tester.runTestMethod()
			}
		})
	}

	/**
	 * Handles changes to the views display
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

	/**
	 * Deactivates the project before destroying
	 *
	 * @return {Promise}
	 */
	async deactivate () {
		if (this.view) {
			const pane = atom.workspace.paneForItem(this.view)
			pane.destroyItem(this.view)
		}

		this.subscriptions.dispose()
		this.tile.destroy()

		this.tile = null
		this.view = null
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
			this.view = new PhpUnitIntegratorView(this.getTester(), this.getConfig(), state)
			this.getViewObserver().observe(this.view)
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

			// this.proxy.activate(coreService)
			this.getTester().activate(coreService)
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
				this.tree = new PhpUnitTreeView(this.getConfig(), this.getTester(), pkg.mainModule.treeView)
			}
		}, (reason) => {
			atom.notifications.addWarning("Failed to load the 'tree-view' package.", {
				description: reason.message
			});
		});
	}

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

	/**
	 * Creates and/or returns the tester instance
	 *
	 * @return {PhpUnitTestRunner}
	 */
	getTester () {
		if (!this.tester) {
			this.tester = new PhpUnitTestRunner(this.getConfig())
		}

		return this.tester
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
}
