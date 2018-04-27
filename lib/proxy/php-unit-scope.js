/** @babel */

import {Range} from 'atom'

export default class PhpUnitScope
{
    /**
     * Constructor
     *
     * @constructor
     * @param {PhpUnitProject}       project                  - The project owner of the source files
     * @param {PhpClassInfo|Object}  classInfo                - The initial scope properties
     * @param {String}               classInfo.name           - The short classname
     * @param {String}               classInfo.namespace      - The namespace part of the classname
     * @param {String}               classInfo.path           - The source file path
     * @param {String}               classInfo.type           - One of 'class', 'trait' or 'abstract'
     * @param {Boolean}              [classInfo.test=true]    - Indicates if the scope is a test file
     * @param {Range}                [classInfo.range=null}]  - The class range within the file
     * @param {PhpMethodInfo|Object} [methodInfo]             - An optional method specifier
     * @param {String}               methodInfo.name          - The method name
     * @param {Range}                [methodInfo.range]       - The method range within the source
     */
    constructor (project, {name, namespace, path, type, test = true, range = null}, methodInfo = null) {
        this.project = project
        this.name = name
        this.namespace = namespace
        this.test = test
        this.path = path
        this.type = type
        this.range = range && Range.fromObject(range, true)

        if (methodInfo) {
            this.method = {
                name: methodInfo.name,
                range: methodInfo.range && Range.fromObject(methodInfo.range, true)
            }
        }
    }

    /**
     * Allows to quickly convert from source to test target
     *
     * This method nullifies any existing ranges. It does not copy ranges from
     * any PhpClassInfo or PhpMethodInfo passed in.
     *
     * @param  {PhpClassInfo|Object} classInfo               - The initial scope properties
     * @param  {String}              classInfo.name          - The short classname
     * @param  {String}              classInfo.namespace     - The namespace name
     * @param  {String}              classInfo.path          - The source of the test file
     * @param  {Boolean}             [classInfo.test=true]   - Indicates if new instance should become a test
     * @param  {String}              [classInfo.method=null] - An optional test method name
     *
     * @return {Self}
     */
    update ({name, namespace, path, test = true, method = null}) {
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
        return new PhpUnitScope(this.project, this, includeMethod ? this.method : null)
    }

    /**
     * Checks if the class/method exists within a file
     *
     * NOTE The check is based on the presence of class/method ranges
     *
     * @return {Boolean}
     */
    exists () {
        return !!(this.method ? this.method.range : this.range)
    }

    /**
     * Returns the project owner of the source file
     *
     * @return {PhpUnitProject}
     */
    getProject () {
        return this.project
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
     * Configures a new range for the scope
     *
     * @param {Range} [range]
     */
    setClassRange (range = null) {
        this.range = range
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

    /**
     * Configures a new range for the method
     *
     * @param  {Range} [range]
     */
    setMethodRange (range = null) {
        if (this.method) {
            this.method.range = range
        }
    }
}
