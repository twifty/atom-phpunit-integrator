/** @babel */

import {Range} from 'atom'

export default class PhpUnitScope
{
	/**
	 * Constructor
	 *
	 * @constructor
	 * @param {Object}  props                - The initial scope properties
	 * @param {String}  props.name           - The short classname
	 * @param {String}  props.namespace      - The namespace part of the classname
	 * @param {String}  props.path           - The source file path
	 * @param {String}  props.type           - One of 'class', 'trait' or 'abstract'
	 * @param {Boolean} [props.test=true]    - Indicates if the scope is a test file
	 * @param {Range}   [props.range=null}]  - The class range within the file
	 * @param {Object}  [method]             - An optional method specifier
	 * @param {String}  method.name          - The method name
	 * @param {Range}   [method.range]       - The method range within the source
	 */
	constructor ({name, namespace, path, type, test = true, range = null}, method) {
		this.name = name
		this.namespace = namespace
		this.test = test
		this.path = path
		this.type = type
		this.range = range && Range.fromObject(range, true)

		if (method) {
			this.method = {
				name: method.name,
				range: method.range && Range.fromObject(method.range, true)
			}
		}
	}

	/**
	 * Allows to quickly convert from source to test target
	 *
	 * @param  {String}  name          - The short classname
	 * @param  {String}  namespace     - The namespace name
	 * @param  {String}  path          - The source of the test file
	 * @param  {String}  [method=null] - An optional test method name
	 * @param  {Boolean} [test=true]   - Indicates if new instance should become a test
	 *
	 * @return {Self}
	 */
	update (name, namespace, path, method = null, test = true) {
		this.name = name
		this.namespace = namespace
		this.test = test
		this.path = path
		this.range = null
		this.method = method ? {name: method} : null

		return this
	}

	/**
	 * Copies the current instance
	 *
	 * @param  {Boolean} [includeMethod=true] - If the method data should be included in the new instance
	 *
	 * @return {PhpUnitScope}                 - The cloned instance
	 */
	clone (includeMethod = true) {
		return new PhpUnitScope(this, includeMethod ? this.method : null)
	}

	/**
	 * Returns the path to the source
	 *
	 * The path may not exist on disk.
	 *
	 * @return {String}
	 */
	getPath () {
		return this.path
	}

	/**
	 * Checks if the instance represents a test file
	 *
	 * @return {Boolean}
	 */
	isTestFile () {
		return this.test
	}

	/**
	 * Returns the short name of the class
	 *
	 * @return {String}
	 */
	getShortClassName () {
		return this.name
	}

	/**
	 * Returns the fully qualified name of the class
	 *
	 * @return {String}
	 */
	getFullClassName () {
		return this.namespace + '\\' + this.name
	}

	/**
	 * Returns the namespace name of the class
	 *
	 * @return {String}
	 */
	getNamespace () {
		return this.namespace
	}

	/**
	 * Returns the range, if present, of the class within the source file
	 *
	 * @return {Range|Null}
	 */
	getClassRange () {
		return this.range
	}

	/**
	 * Checks if method data is available
	 *
	 * @return {Boolean}
	 */
	hasMethod () {
		return !!this.method
	}

	/**
	 * Returns the method name
	 *
	 * @return {String}
	 */
	getMethodName () {
		return this.method ? this.method.name : null
	}

	/**
	 * Returns the range, if present, within the source file
	 *
	 * @return {Range|Null}
	 */
	getMethodRange () {
		return this.method ? this.method.range : null
	}
}
