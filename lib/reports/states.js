/** @babel */

export const STATES = {
    'passed': 0,
    'skipped': 1,
    'warning': 2,
    'failure': 3,
    'error': 4
}

export const STATE_HIERARCHY = {
    0: 'passed',
    1: 'skipped',
    2: 'warning',
    3: 'failure',
    4: 'error'
}

export function maxState () {
    const states = [...arguments].reduce((a, s) => a.concat(s), []).sort(compareStates)

    return states.pop()
}

export function compareStates (l, r) {
    return STATES[l] - STATES[r]
}
