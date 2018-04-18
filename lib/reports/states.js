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

export function maxState (l, r) {
	return STATE_HIERARCHY[
		Math.max( STATES[l], STATES[r] )
	]
}

export function compareStates (l, r) {
	return STATES[l] - STATES[r]
}
