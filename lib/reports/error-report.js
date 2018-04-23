/** @babel */

export default class ErrorReport
{
    /**
     * Constructor
     *
     * @constructor
     * @param {String} type    - The type of error, should match the parent state
     * @param {String} message - A short description of the error
     * @param {String} detail  - A detailed description of the error
     */
    constructor ({type, message, detail}) {
        this.type = type
        this.message = message
        this.detail = detail
    }

    /**
     * Returns the type of error
     *
     * @return {String} - Should match the parent state
     */
    getType () {
        return this.type
    }

    /**
     * Returns a short description of the error
     *
     * @return {String}
     */
    getMessage () {
        return this.message
    }

    /**
     * Returns a detailed description of the error
     *
     * @return {String} - The description lines
     */
    getDetail () {
        return this.detail
    }
}
