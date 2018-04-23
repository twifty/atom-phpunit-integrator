/** @babel */

export default class LineReport
{
    /**
     * Constructor
     *
     * @constructor
     * @param {String}  type    - The type of code on the line
     * @param {Number}  num     - The line number
     * @param {Boolean} covered - True if the line is covered
     * @param {Object}  [meta]  - Optional additional line parameters
     */
    constructor ({type, num, covered, meta = null}) {
        this.type = type
        this.num = num
        this.covered = covered
        this.meta = meta
    }

    /**
     * Returns the type of code on the line
     *
     * NOTE this is only required for counting statements
     *
     * @return {String}
     */
    getType () {
        return this.type
    }

    /**
     * Returns the line number within the source
     *
     * @return {Number} - A, one based, line number
     */
    getNum () {
        return this.num
    }

    /**
     * Returns any additional parameters for the line
     *
     * @return {Object|Null}
     */
    getMeta () {
        return this.meta
    }

    /**
     * Checks if the line is covered
     *
     * @return {Boolean}
     */
    isCovered () {
        return !!this.covered
    }
}
