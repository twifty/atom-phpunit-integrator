/** @babel */
/* global WeakMap Promise atom console */

import {CompositeDisposable, Range} from 'atom'

import PhpUnitScope from './php-unit-scope'
import {fileExists} from '../util/php-unit-utils'

/*
 * This class is heavily tied to the php service. Though a service for another
 * language could be used, it still runs on the concept of classes and methods.
 * Perhaps we should also include global/file/namespace scoped functions.
 */
export default class PhpUnitProxy
{
	/**
	 * Initializes the instance
	 *
	 * @constructor
	 * @param {PhpUnitProjectManager} projectManager - The main project manager
	 */
	constructor (projectManager) {
		this.projectManager = projectManager
		this.disposables = new CompositeDisposable()

		this.observing = {}
		this.excluding = {}
		this.cache = null

		this.classRanges = new WeakMap()
		this.methodRanges = new WeakMap()
		this.classMapping = new WeakMap()
		this.methodMapping = new WeakMap()
	}

	/**
	 * Enables the instance to function
	 *
	 * If this method is not called, files will not be observed and any class/method
	 * ranges will not be available.
	 *
	 * @param  {PhpCoreService} service - The php-integrater-core wrapper service
	 *
	 * @return {Promise}                - Resolves after observers have started
	 */
	activate (service) {
		this.service = service

		return this.service.activate().then(() => {
			this.beginObservers()
		})
	}

	/**
	 * Destroys all internal references
	 */
	destroy () {
		this.disposables.dispose()
		this.classRanges.clear()
		this.methodRanges.clear()
		this.classMapping.clear()
		this.methodMapping.clear()
	}

	/**
	 * Returns the scope of the most recently added cursor
	 *
	 * @param  {TextEditor}        editor - The text editor to examine
	 *
	 * @return {PhpUnitScope|Null}        - The scope data or null if not found
	 */
	getScopeForCursor (editor) {
		if (editor) {
			const point = editor.getCursorBufferPosition()

			// TODO is the row zero or one based?
			return this.getScopeForPoint(editor, point)
		}
	}

	/**
	 * Returns the scope of a mouse click
	 *
	 * @param  {TextEditor}        editor - The text editor to examine
	 * @param  {MouseEvent}        event  - The mouse event
	 *
	 * @return {PhpUnitScope|Null}        - The scope data or null if not found
	 */
	getScopeForEvent (editor, event) {
		if (this.cache && this.cache.event === event) {
			return this.cache.scope
		}

		if (!editor || !event || !editor.getElement().contains(event.target)) {
			return null
		}

		const {component} = atom.views.getView(editor)
		const position = component.screenPositionForMouseEvent(event)

		position.row = editor.bufferRowForScreenRow(position.row)

		const scope = this.getScopeForPoint(editor, position)

		this.cache = {
			event,
			scope
		}

		return scope
	}

	/**
	 * Returns the scope of a file position
	 *
	 * @param  {TextEditor}        editor - The text editor to examine
	 * @param  {Point}             point  - The editor buffer position
	 *
	 * @return {PhpUnitScope|Null}        - The scope data or null if not found
	 */
	getScopeForPoint (editor, point) {
		const project = this.projectManager.getProjectForEditor(editor)

		if (!project || !editor || !point) {
			return null
		}

		if (this.classRanges.has(editor)) {
			let mappedClass,
				mappedMethod

			for (const classRange of this.classRanges.get(editor)) {
				if (classRange.containsPoint(point)) {
					mappedClass = Object.assign({}, this.classMapping.get(classRange))
					break
				}
			}

			if (mappedClass && this.methodRanges.has(editor)) {
				for (const methodRange of this.methodRanges.get(editor)) {
					if (methodRange.containsPoint(point)) {
						mappedMethod = Object.assign({}, this.methodMapping.get(methodRange))
						break
					}
				}
			}

			if (mappedClass) {
				return new PhpUnitScope(project, mappedClass, mappedMethod)
			}
		}

		return null
	}

	/**
	 * Finds the available class scopes within a file
	 *
	 * @param  {String}  file - The full path of a file to query
	 *
	 * @return {Promise<Array<PhpUnitScope>>}
	 */
	async getClassScopesForFile (file) {
		const project = this.projectManager.getProject(file)

		if (!project || !this.service) {
			return null
		}

		const classList = await this.service.getClassListForFile(file)
		const resolvers = []

		for (const className of classList) {
			resolvers.push((async () => {
				const classInfo = await this.service.getClassInfo(className)
				const classMap = this.mapClassInfo(classInfo)

				return new PhpUnitScope(project, classMap)
			})())
		}

		return Promise.all(resolvers)
	}

	/**
	 * Finds all method scopes for a class
	 *
	 * @param  {String}  className - The fully qualified class name to query
	 *
	 * @return {Promise<Array<PhpUnitScope>>}
	 */
	async getScopeForClass (className) {
		if (!this.service) {
			return null
		}

		try {
			const classInfo = await this.service.getClassInfo(className)
			const classMap = this.mapClassInfo(classInfo)
			const project = this.projectManager.getProject(classInfo.filename)

			if (project) {
				return new PhpUnitScope(project, classMap)
			}
		} catch (error) {
			if (error.response && error.response.code.error === -32001) {
				return null
			}
			throw error
		}
	}

	/**
	 * Finds the scope of a method within a class
	 *
	 * @param  {String}  className  - The fully qualified class name to query
	 * @param  {String}  methodName - The name of a method within the class
	 *
	 * @return {Promise<PhpUnitScope>}
	 */
	async getScopeForMethod (className, methodName) {
		if (!this.service) {
			return null
		}

		try {
			const classInfo = await this.service.getClassInfo(className)
			const project = this.projectManager.getProject(classInfo.filename)

			if (project && methodName in classInfo.methods) {
				const classMap = this.mapClassInfo(classInfo)
				const methodMap = this.mapMethodInfo(classInfo.methods[methodName])

				return new PhpUnitScope(classMap, methodMap)
			}
		} catch (error) {
			if (error.response && error.response.code.error === -32001) {
				return null
			}
			throw error
		}
	}

	/**
	 * Checks a scope has been configured correctly
	 *
	 * If a simple object is given, it will be converted to an a scope instance.
	 * Class and method ranges will be removed, if the indicated classes/files/methods
	 * don't exist.
	 *
	 * @param  {Object|PhpUnitScope}  scope - A scope or scope like object
	 * @return {Promise}                    - Resolves with the validated scope
	 * @throws                              - If name, namespace or path or not present
	 */
	async validateScope (scope) {
		if (!scope) {
			throw new Error('validateScope: No Scope available')
		}

		['name', 'namespace', 'path', 'type'].forEach(entry => {
			if (typeof scope[entry] !== 'string' || '' === scope[entry]) {
				throw new Error(`Scope contains an invalid '${entry}' property (${scope[entry]})`)
			}
		})

		if (!scope.project) {
			const project = this.projectManager.getProject(scope.path)

			if (!project) {
				throw new Error(`A project could not be found for the scope path '${scope.path}'`)
			}

			scope.project = project
		}

		if ('methodName' in scope) {
			scope.method = {
				name: scope.methodName
			}
			delete scope.methodName
		}

		if (scope.method && (typeof scope.method.name !== 'string' || '' === scope.method.name)) {
			throw new Error(`validateScope: Scope contains an invalid 'method.name' property (${scope.method.name})`)
		}

		scope.range = null

		try {
			const exists = await fileExists(scope.path)

			if (exists) {
				const classInfo = await this.service.getClassInfo(scope.namespace + '\\' + scope.name)
				scope.range = new Range([classInfo.startLine, 0], [classInfo.endLine, 0])

				if (scope.method) {
					if (scope.method.name in classInfo.methods) {
						const methodInfo = classInfo.methods[scope.method.name]
						scope.method.range = new Range([methodInfo.startLine, 0], [methodInfo.endLine, 0])
					} else {
						scope.method.range = null
					}
				}
			}
		} catch (error) {
			// It's possible the file exists but a class doesn't
			if (error.response && error.response.error && error.response.error.code === -32001) {
				atom.notifications.addError("File found but class missing", {
					detail: `The source file '${scope.path}' exists, but the database ` +
							'could not find any classes within the file.\n\n' +
							'Either remove the empty file or reindex the project.',
					dismissable: true
				})
			} else {
				throw error
			}
		}

		if (!(scope instanceof PhpUnitScope)) {
			scope = new PhpUnitScope(scope.project, scope, scope.method)
		}

		return scope
	}

	/**
	 * Finds and/or creates a test suite class
	 *
	 * @param  {PhpUnitScope}          source - The scope of the source file
	 *
	 * @return {Promise<PhpUnitScope>}        - Resolves when complete
	 */
	async resolveTestClass (source) {
		source = source.clone(false)

		return this.resolveTarget(source)
	}

	/**
	 * Finds and/or creates a test suite method
	 *
	 * @param  {PhpUnitScope}          source - The scope of the source file
	 *
	 * @return {Promise<PhpUnitScope>}        - Resolves when complete
	 */
	async resolveTestCase (source) {
		source = source.clone(true)

		return this.resolveTarget(source)
	}

	/**
	 * Converts a source scope into a target scope
	 *
	 * @param  {PhpUnitScope}  source - The scope to convert
	 *
	 * @return {Promise<PhpUnitScope>}
	 */
	async resolveTarget (source) {
		const project = source.getProject()
		const adapter = project.getAdapter()

		const target = await adapter.describe(source.clone())

		if (target) {
			return await this.validateScope(target)
		}

		return null
	}

	/**
	 * Hooks the open and future text editors and updates the ranges after any changes
	 *
	 * @private
	 */
	beginObservers () {
		this.service.activate().then(() => {
			this.disposables.add(this.service.onDidFinishIndexing(({path: paths}) => {
				if (!Array.isArray(paths)) {
					this.createRangesForEditors(this.observing[paths])
				} else {
					for (const path of paths) {
						this.createRangesForEditors(this.observing[path])
					}
				}
			}))

			this.disposables.add(atom.workspace.observeTextEditors(this.observeTextEditor.bind(this)))
		})
	}

	/**
	 * Checks if the editor is for a PHP file
	 *
	 * @private
	 * @param  {TextEditor}  editor - An atom text editor instance
	 *
	 * @return {Boolean}            - true if it is a PHP file
	 */
	isEditorOfInterest (editor) {
		return null != this.projectManager.getProjectForEditor(editor)
	}

	/**
	 * Caches the editors by file path
	 *
	 * Keeping references to editors with ranges allows us to fetch
	 * them quickly after they have been reindexed.
	 *
	 * @private
	 * @param  {TextEditor}  editor - An atom text editor instance
	 */
	observeTextEditor (editor) {
		if (!this.isEditorOfInterest(editor)) {
			return
		}

		const path = editor.getPath()

		editor.onDidDestroy(() => {
			this.clearRangesForEditor(editor)

			const list = this.observing[path]
			const index = list && list.indexOf(editor)

			if (list && 0 <= index) {
				if (1 === list.length) {
					delete this.observing[path]
				} else {
					list.splice(index, 1)
				}
			}
		})

		// NOTE It's possible for multiple editors to be open for the same path
		if (!this.observing[path]) {
			this.observing[path] = [editor]
		} else {
			this.observing[path].push(editor)
		}

		// TODO Tie to the path not the editor
		// TODO If path is a common file, attempt to also range the test file
		this.createRangesForEditor(editor)
	}

	/**
	 * Converts the mouse event coordinates to a TextBuffer Point offset
	 *
	 * @private
	 * @param  {MouseEvent} event  - The mouse event which prompted the context menu
	 * @param  {TextEditor} editor - The currently active text editor
	 *
	 * @return {Point}             - The buffer position
	 */
	getTextBufferPosition (event, editor) {
		if (editor && event) {
			const {component} = atom.views.getView(editor)
			const screenPosition = component.screenPositionForMouseEvent(event)

			return {
				row: editor.bufferRowForScreenRow(screenPosition.row),
				column: screenPosition.column
			}
		}
	}

	/**
	 * Builds ranges for multiple editors
	 *
	 * @private
	 * @see {@link createRangesForEditor}
	 * @param  {Array} editors - The text editors for which to build ranges
	 */
	createRangesForEditors (editors) {
		if (editors) {
			for (const editor of editors) {
				this.createRangesForEditor(editor)
			}
		}
	}

	/**
	 * Clears then rebuilds the ranges available within the editors text
	 *
	 * This is called every time an editor being observed has changed. It queries
	 * the database for the classlist then for each class info. It then stores
	 * the buffer ranges and a mapping info object for each class and method found.
	 *
	 * @todo Enable a way to cancel when reindex is called on same editor
	 *
	 * @private
	 * @param  {TextEditor}  editor - An atom text editor instance
	 *
	 * @return {Promise}            - Resolves with nothing
	 */
	async createRangesForEditor (editor) {
		if (!this.isEditorOfInterest(editor)) {
			return
		}

		const path = editor.getPath()

		if (!path || !this.observing[path] || this.excluding[path]) {
			return
		}

		this.clearRangesForEditor(editor)

		try {
			const classList = await this.service.getClassListForFile(path)
			const resolvers = classList.map(name => {
				return this.service.getClassInfo(name)
			})

			const classInfos = await Promise.all(resolvers)

			const classRanges = []
			const methodRanges = []

			for (const classInfo of classInfos) {
				const classRange = new Range([classInfo.startLine, 0], [classInfo.endLine,0])
				const classMap = this.mapClassInfo(classInfo)

				classRanges.push(classRange)
				this.classMapping.set(classRange, classMap)

				for (const methodInfo of Object.values(classInfo.methods)) {
					if (methodInfo.isPublic && !methodInfo.isAbstract) {
						if ('__construct' !== methodInfo.name && path === methodInfo.filename) {
							const methodRange = new Range([methodInfo.startLine, 0], [methodInfo.endLine, 0])
							const methodMap = this.mapMethodInfo(methodInfo)

							methodRanges.push(methodRange)
							this.methodMapping.set(methodRange, methodMap)
						}
					}
				}
			}

			this.classRanges.set(editor, classRanges)
			this.methodRanges.set(editor, methodRanges)
		} catch (e) {
			if (e.response && e.response.error) {
				// This appears to be a generic not found error code. It's possible for
				// a TextEditor to have PHP content in an in-memory file.
				if (e.response.error.code !== -32001) {
					console.error(`The PHP service responded with error (${e.response.error.code}) "${e.response.error.message}"`)
				}
			} else {
				console.error(e)
			}
		}
	}

	/**
	 * Deletes all cached ranges associated with the editor
	 *
	 * @private
	 * @param  {TextEditor}  editor - An atom text editor instance
	 */
	clearRangesForEditor (editor) {
		if (this.classRanges.has(editor)) {
			for (const range of this.classRanges.get(editor)) {
				this.classMapping.delete(range)
			}
			this.classRanges.delete(editor)
		}

		if (this.methodRanges.has(editor)) {
			for (const range of this.methodRanges.get(editor)) {
				this.methodMapping.delete(range)
			}
			this.methodRanges.delete(editor)
		}
	}

	/**
	 * Converts a classinfo object from the database to a smaller object
	 *
	 * @private
	 * @param  {Object} classInfo - the database query result
	 *
	 * @return {Object}           - a compacted version of the input
	 */
	mapClassInfo (classInfo) {
		const names = classInfo.fqcn.split('\\').slice(0, -1)
		const test = 0 <= classInfo.parents.indexOf("\\PHPUnit\\Framework\\TestCase")

		const source = {
			path: classInfo.filename,
			name: classInfo.name,
			namespace: names.join('\\'),
			type: classInfo.isAbstract ? 'abstract' : classInfo.type,
			test,
			range: new Range([classInfo.startLine, 0], [classInfo.endLine, 0])
		}

		return source
	}

	/**
	 * Converts a methodinfo object from the database to a smaller object
	 *
	 * @private
	 * @param  {Object} classInfo - the database query result
	 *
	 * @return {Object}           - a compacted version of the input
	 */
	mapMethodInfo (methodInfo) {
		const source = {
			name: methodInfo.name,
			range: new Range([methodInfo.startLine , 0], [methodInfo.endLine, 0])
		}

		return source
	}
}
