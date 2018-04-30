## php-unit-integrator package

Integrates the phpunit testing system into the atom text editor.

This is in beta mode at the moment. I would appreciate any testers and feedback.

![screenshot](screenshots/screenshot.png)

###### Features:
1. Point and click interface
1. Code Coverage highlighting
1. Test Suite/Case generation
1. `phpunit.xml` and `phpunit.xml.dist` aware
1. Runs test suites/groups/cases
1. Quick navigation links to errors
1. Progressive test output
1. Vertical / Horizontal layout
1. Tree View integration

###### Keyboard shortcuts

* `cmd-alt-u` | `ctrl-alt-u`: Toggles the test view
* `cmd-alt-t` | `ctrl-alt-t`: Runs the currently selected test suite
* `cmd-alt-f` | `ctrl-alt-f`: Runs the open file
* `cmd-alt-c` | `ctrl-alt-c`: Runs the test class under the cursor
* `cmd-alt-y` | `ctrl-alt-y`: Runs all test suites in the `phpunit.xml` file
* `cmd-alt-g` | `ctrl-alt-g`: Runs all files in the test directory
* `cmd-alt-v` | `ctrl-alt-v`: Runs the test method under the cursor
* `cmd-alt-k` | `ctrl-alt-k`: Goto the test class under the cursor
* `cmd-alt-m` | `ctrl-alt-m`: Goto the test method under the cursor

In addition to keyboard shortcuts, it is also possible to run tests and navigate
to test files by right-clicking within a class or method body and selecting
the appropriate entry in the context menu.

###### Usage
All testable projects are required to have either a `phpunit.xml` or `phpunit.xml.dist`
file in the project root.

The default installation presumes you have 'src' and 'tests' directories in the
root of your project. It also presumes you use the 'Test' namespace segment for
all classes within the 'tests' directory.

For example, a source class located at:  
`/var/www/project/src/Entity/User.php` under the namespace `\Vendor\Project\Entity`  
will be mapped to a test class located at:  
`/var/www/project/tests/Entity/UserTest.php` under the namespace `\Vendor\Project\Test\Entity`

This default behaviour can be modified by placing a `phpunit.js` (or `phpunit.coffee`)
file in any directory between the source file and the project root. This file can
contain any valid `nodejs` code, but it must export a single object which contains
the redefined methods of [PhpUnitDefaultAdapter](lib/proxy/php-unit-default-adapter.js).

So, for example, to change the default test directory from `tests` to `spec` include
the following in the file:
```js
module.exports = {
	getTargetDirectory() {
		return 'spec';
	}
}
```
All methods declared in this file will replace the original methods in a new instance.
So, it is safe to call other methods using `this` or even store properties in the
instance.

The first adapter found, searching from the source towards the root, will be used.
This allows for a per-directory configuration.

###### Code Coverage
When the XDebug module is loaded via your `php.ini` configuration, a 'Code Coverage'
toggle button will become available in the packages main view. For those of you whom
don't want XDebug enabled system wide, The full path to the XDebug extension can
be configured within the package settings. This will display the 'Code Coverage'
toggle and only load the extension when the toggle is enabled.

###### Background
After switching to atom, I missed the phpunit integration within the netbeans
editor. This is an attempt at creating a similar environment.

Copyright (c) 2018 Owen Parry <waldermort@gmail.com>
