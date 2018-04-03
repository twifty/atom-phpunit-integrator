/** @babel */
/* global atom console Promise */

import {CompositeDisposable, Point, Range} from 'atom'

import {openInAtom, offsetRange, offsetPoint} from '../util/php-unit-utils'
import PhpUnitSkelgenView from '../views/php-unit-skelgen-view'
import PhpSkelgenFactory from './php-skelgen-factory'

export default class PhpSkelgenObserver
{
	/**
	 * Initializes the instance
	 *
	 * @constructor
	 * @param {PhpUnitProxy} proxy - The layer which generates files scopes
	 */
	constructor (proxy) {
		this.proxy = proxy
		this.disposables = new CompositeDisposable()
		this.factory = new PhpSkelgenFactory()

		this.createContextMenu()
	}

	/**
	 * Destroys all internal references
	 */
	destroy () {
		this.disposables.dispose()
	}

	/**
	 * Finds and/or creates a test suite class
	 *
	 * @param  {PhpUnitScope} source                       - The scope of the source file
	 * @param  {Object}       [options]                    - Open/Create options
	 * @param  {Boolean}      [options.shouldOpen=true]    - Will open the file in the editor
	 * @param  {Boolean}      [options.shouldCreate=true]  - Will prompt to create the file if it doesn't exist
	 * @param  {Function}     [options.onWillCreate]       - Called before creating the file
	 * @param  {Function}     [options.onDidCreate]        - Called after creating the file
	 *
	 * @return {Promise<PhpUnitScope>}                     - Resolves when complete
	 */
	async resolveTestSuite (source, options = {}) {
		options = Object.assign({
			shouldOpen: true,
			shouldCreate: true
		}, options)

		// Strip any method range from the source
		source = source.clone(false)

		const target = await this.resolveTarget(source)

		if (!target) {
			return null
		}

		if (!target.getClassRange()) {
			if (options.shouldCreate) {
				try {
					return this.promptToCreate(source, target, options)
				} catch (error) {
					if ('cancelled' !== error) {
						throw error
					}
				}
			}

			return null
		}

		if (options.shouldOpen) {
			return this.openTest(source, target, options)
		}

		return target
	}

	/**
	 * Finds and/or creates a test suite method
	 *
	 * @param  {PhpUnitScope} source                       - The scope of the source file
	 * @param  {Object}       [options]                    - Open/Create options
	 * @param  {Boolean}      [options.shouldOpen=true]    - Will open the file in the editor
	 * @param  {Boolean}      [options.shouldCreate=true]  - Will prompt to create the file if it doesn't exist
	 * @param  {Function}     [options.onWillCreate]       - Called before creating the file
	 * @param  {Function}     [options.onDidCreate]        - Called after creating the file
	 *
	 * @return {Promise<PhpUnitScope>}                     - Resolves when complete
	 */
	async resolveTestCase (source, options) {
		options = Object.assign({
			shouldOpen: true,
			shouldCreate: true
		}, options)

		// Keep any method range from the source
		source = source.clone(true)

		const target = await this.resolveTarget(source)

		if (!target) {
			return null
		}

		if (!target.getMethodRange()) {
			if (options.shouldCreate) {
				try {
					return this.promptToCreate(source, target, options)
				} catch (error) {
					if ('cancelled' !== error) {
						throw error
					}
				}
			}

			return null
		}

		if (options.shouldOpen) {
			return this.openTest(source, target, options)
		}

		return target
	}

	/**
	 * Adds the context menu items to the atom text editor
	 *
	 * @private
	 */
	createContextMenu () {
		this.disposables.add(atom.contextMenu.add({
			"atom-text-editor": [
				{
					"label": "Go to TestCase",
					"command": "php-unit-integrator:editor-goto-testcase",
					shouldDisplay: (event) => {
						const editor = atom.workspace.getActiveTextEditor()

						this.currentScope = this.proxy.getScopeForEvent(editor, event)

						return this.currentScope && this.currentScope.getMethodName() && !this.currentScope.isTestFile()
					}
				}, {
					"label": "Go to TestSuite",
					"command": "php-unit-integrator:editor-goto-testsuite",
					shouldDisplay: (event) => {
						const editor = atom.workspace.getActiveTextEditor()

						this.currentScope = this.proxy.getScopeForEvent(editor, event)

						return this.currentScope && !this.currentScope.isTestFile()
					}
				}, {
					type: 'separator'
				}
			]
		}))

		// Shift menu items to the front
		atom.contextMenu.itemSets.unshift(atom.contextMenu.itemSets.pop())

		const validateAndOpen = async (shouldClone) => {
			if (!this.currentScope) {
				console.error('openTest: Failed to find a valid source')
			} else {
				try {
					const source = this.currentScope.clone(shouldClone)
					const target = await this.resolveTarget(source)

					if (target) {
						return await this.openTest(source, target)
					}
				} catch (error) {
					if ('cancelled' !== error) {
						throw error
					}
				}
			}
		}

		this.disposables.add(atom.commands.add('atom-text-editor', {
			'php-unit-integrator:editor-goto-testcase': () => {
				validateAndOpen(true)
			},
			'php-unit-integrator:editor-goto-testsuite': () => {
				validateAndOpen(false)
			}
		}))
	}

	/**
	 * Converts a source scope into a target scope
	 *
	 * @param  {PhpUnitScope}  source - The scope to convert
	 *
	 * @return {Promise<PhpUnitScope>}
	 */
	async resolveTarget (source) {
		const target = this.factory.describeTarget(source.clone())

		if (target) {
			return await this.proxy.validateScope(target)
		}

		return null
	}

	/**
	 * The context menu command handler
	 *
	 * @private
	 * @param  {PhpUnitScope} gotoMethod - The source file scope
	 * @param  {Object}       [options]  - Open/Create options
	 *
	 * @return {Promise}                 - Resolves with nothing
	 */
	async openTest (source, target, options = {}) {
		let fileRow

		try {
			if (source.getMethodRange()) {
				if (!target.getMethodRange()) {
					return this.promptToCreate(source, target, options)
				}

				fileRow = target.getMethodRange().start.row
			} else if (!target.getClassRange()) {
				return this.promptToCreate(source, target, options)
			} else {
				fileRow = target.getClassRange().start.row
			}

			// Use await to catch the errors
			await openInAtom(target.getPath(), fileRow)

			return target
		} catch (error) {
			console.error(error)
		}
	}

	/**
	 * Creates a modal dialog asking user if they want to create the class/method
	 *
	 * @param  {Object} source      - the source meta
	 * @param  {Object} target      - the target meta
	 * @param  {Object} [classInfo] - the database query result
	 *
	 * @return {Promise}            - Resolves with nothing
	 */
	async promptToCreate (source, target, options) {
		if (options && options.shouldCreate === false) {
			return Promise.reject('aborted')
		}

		if (options && typeof options.onWillCreate === 'function') {
			options.onWillCreate(target.clone())
		}

		if (!this.promptView) {
			this.promptView = new PhpUnitSkelgenView()
		}

		const deferred = {}

		deferred.promise = new Promise((resolve, reject) => {
			deferred.resolve = resolve
			deferred.reject = reject
		})

		const handler = async (result) => {
			if (!result) {
				return deferred.reject('cancelled')
			}

			await this.generateTestCase(source, target)

			if (options && typeof options.onDidCreate === 'function') {
				options.onDidCreate(target.clone())
			}

			deferred.resolve(target)
		}

		this.promptView.open(target, handler)

		return deferred.promise
	}

	/**
	 * Helper method for cursor/selection positioning in test file
	 *
	 * @private
	 * @param  {Object} meta          - the content about to be rendered
	 * @param  {Number} [startLine=0] - the insertion position within the file
	 *
	 * @return {Object}               - the adjusted text cursor and selection range
	 */
	offsetCursor (meta, start) {
		const cursor = start.copy()
		const select = new Range(start.copy(), start.copy())

		if (meta.cursor) {
			offsetPoint(cursor, meta.cursor, false)
		}

		if (meta.select) {
			offsetRange(select, meta.select, false)
		}

		return {
			text: typeof meta.text === 'string'
				? meta.text
				: meta,
			cursor,
			select
		}
	}

	/**
	 * Appends a new test case method to an existing test suite
	 *
	 * @private
	 * @param  {Object}  source      - the source meta data
	 * @param  {Object}  target      - the target meta data
	 * @param  {Object}  [classInfo] - the database query result
	 *
	 * @return {Promise}             - Resolves with nothing
	 */
	async generateTestCase (source, target) {
		try {
			var meta,
				insertPos

			const editor = await atom.workspace.open(target.path)

			if (!target.getClassRange()) {
				await editor.save()
				meta = this.factory.createTestSuite(source, target)
				insertPos = new Point(0, 0)
			} else {
				meta = this.factory.createTestCase(source, target)
				insertPos = target.getClassRange().end.copy()
				insertPos.row -= 1
			}

			const {text, cursor, select} = this.offsetCursor(meta, insertPos)

			editor.setTextInBufferRange(new Range(insertPos, insertPos), text)

			if (!select.isEmpty()) {
				editor.setSelectedBufferRange(select)
			} else {
				editor.setCursorBufferPosition(cursor)
			}

			editor.scrollToCursorPosition()

		} catch (error) {
			console.error(error)
		}
	}
}
