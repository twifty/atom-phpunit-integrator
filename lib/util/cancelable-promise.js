/** @babel */
/* global Promise */

export default class CancelablePromise
{
    /**
     * Constructor.
     *
     * @constructor
     * @param {Function} executor      - A function which accepts the usual resolve and reject callbacks
     * @param {Function} cancelHandler - A function to call in the event this promise is canceled
     */
    constructor (executor, cancelHandler) {
        this.isFinished = false
        this.promise = new Promise(executor)
        this.cancelHandler = cancelHandler || (() => {})
    }

    /**
     * Cancels the promise and calls any attached cencel handlers
     */
    cancel () {
        if (!this.isFinished) {
            this.cancelHandler()
        }
    }

    /**
     * Appends a resolution handler and an optional rejection handler
     *
     * @param  {Function} [onResolve] - Called if the promise resolves
     * @param  {Function} [onReject]  - Called if the promise rejects
     * @return {Promise}               [description]
     */
    then (onResolve = undefined, onReject = undefined) {
        const deferred = new CancelablePromise((resolve, reject) => {
            this.promise.then(result => {
                if (this.isFinished) {
                    deferred.cancel()
                    resolve(result)
                }
                if (onResolve && !this.isFinished) {
                    try {
                        resolve(onResolve(result))
                    } catch (error) {
                        reject(error)
                    }
                } else {
                    resolve(result)
                }
            }, error => {
                if (this.isFinished) {
                    deferred.cancel()
                }
                if (onReject && !this.isFinished) {
                    try {
                        resolve(onReject(error))
                    } catch (error) {
                        reject(error)
                    }
                } else {
                    reject(error)
                }
            })
        }, this.cancelHandler)

        return deferred
    }

    /**
     * Appends a rejection handler to the promise
     *
     * @param {Function} onReject - The rejection handler
     *
     * @return {Promise}          - Resolves with either the result of `onReject`, or the original resolved value
     */
    catch (onReject) {
        return this.then(undefined, onReject)
    }

    /**
     * Appends a handler which is called regardless of if the promise resolves or not
     *
     * NOTE: supported in chrome v63 and up, atom v1.25 still uses chrome v59
     *
     * @param  {Function} onFinally - The finally handler
     *
     * @return {Promise}            - Resolved when the original promise resolves
     */
    finally (onFinally) {
        // return this.promise.finally(onFinally)
        return this.then((value) => {
            return Promise.resolve(onFinally()).then(() => {
                return value
            })
        }, (error) => {
            return Promise.resolve(onFinally()).then(() => {
                throw error
            })
        })
    }
}
