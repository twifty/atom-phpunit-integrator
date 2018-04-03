/** @babel */
/* global atom document */

import {CompositeDisposable} from 'atom';

import PhpUnitStatusBarView from './views/php-unit-status-bar-view'
import PhpUnitIntegratorView from './views/php-unit-integrator-view'
import PhpUnitCoverageMarkers from './markers/php-unit-coverage-markers'
import PhpUnitConfig from './config/php-unit-config'
import ViewObserver from './util/view-observer'
import PhpCoreService from './proxy/php-core-service'

import PhpUnitProjectTester from './project/php-unit-project-tester'

export default {
	view: null,
	tile: null,
	subscriptions: null,
	manager: null,

	/**
	 * Activates the package with the previous state
	 *
	 * @param  {Object} state - The previous result of @see {@link serialize}
	 */
	activate () {
		this.subscriptions = new CompositeDisposable()
		this.markerLayer = new PhpUnitCoverageMarkers(this.getTester())

		this.subscriptions.add(atom.commands.add('atom-workspace', {'php-unit-integrator:toggle': () => {
			this.toggle()
		}}))

		const handler = (which) => {
			const active = document.activeElement

			this.show().then(() => {
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
			}).then(() => {
				active.focus()
			})
		}

		this.subscriptions.add(atom.commands.add("atom-text-editor[data-grammar='text html php']", {
			'php-unit-integrator:run-test-suite': handler.bind(null, 'suite'),
			'php-unit-integrator:run-test-file': handler.bind(null, 'file'),
			"php-unit-integrator:run-test-all-suites": handler.bind(null, 'all-suites'),
			"php-unit-integrator:run-test-all-files": handler.bind(null, 'all-files'),
			"php-unit-integrator:run-test-class": handler.bind(null, 'class'),
			"php-unit-integrator:run-test-method": handler.bind(null, 'method'),
		}))

		const integratorBasePath = atom.packages.resolvePackagePath('php-integrator-base')

		if (integratorBasePath) {
			const coreService = new PhpCoreService(integratorBasePath)

			// this.proxy.activate(coreService)
			this.getTester().activate(coreService)
		}

		this.observeView()

		if (true === this.getConfig().get('autoOpen')) {
			this.toggle()
		}
	},

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
			let orientation = 'vertical'
			if (-1 !== ['left', 'right'].indexOf(dock.location)) {
				orientation = 'horizontal'
			}

			this.view.update({orientation})
		}))

		this.subscriptions.add(viewObserver.onWillDestroy(() => {
			this.tile.setActive(false)
			this.view.destroy()
			this.view = null
			this.active = false
		}))
	},

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
	},

	/**
	 * Renders shows and/or hides the view
	 */
	toggle () {
		if (this.view) {
			atom.workspace.toggle(this.view)
		} else {
			this.show()
		}
	},

	/**
	 * Opens the view
	 *
	 * @return {Promise}
	 */
	show () {
		return atom.workspace.open(this.createIntegratorView())
	},

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
	},

	/**
	 * Creates and/or returns the tester instance
	 *
	 * @return {PhpUnitProjectTester}
	 */
	getTester () {
		if (!this.tester) {
			this.tester = new PhpUnitProjectTester(this.getConfig())
		}

		return this.tester
	},

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
};
