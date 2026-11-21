/** @jest-environment jsdom */
'use strict';

const fs = require( 'fs' );
const path = require( 'path' );
const $ = require( 'jquery' );
const resources = path.join( __dirname, '../../resources' );
const targetSource = fs.readFileSync( path.join( resources, 'ext.veforall.target.js' ), 'utf8' );
const wideSource = fs.readFileSync( path.join( resources, 'ext.veforall.targetwide.js' ), 'utf8' );

let mw;
let toolbarConfig;

beforeEach( () => {
	document.body.innerHTML = '';
	toolbarConfig = {
		VEForAllToolbarNormal: [
			{ name: 'custom-format', header: 'format', include: { group: 'format' } },
			{ title: 'styles', include: [ 'bold', 'italic' ] },
			{ include: [ 'link' ] }
		],
		VEForAllToolbarWide: [
			{ header: 'format-wide', include: { group: 'format' } },
			{ name: 'custom-wide', include: [ 'insertTable' ] }
		]
	};

	mw = {
		config: { get: ( name ) => toolbarConfig[ name ] },
		msg: ( name ) => name
	};

	const baseTarget = function () {};
	baseTarget.static = {
		importRules: { external: { blacklist: [ 'link/mwExternal', 'another-rule' ] } }
	};

	const OO = {
		inheritClass: ( child, parent ) => {
			child.parent = parent;
			child.prototype = Object.create( parent.prototype );
			child.prototype.constructor = child;
			child.static = Object.create( parent.static );
		},
		ui: { deferMsg: ( message ) => 'deferred:' + message },
		simpleArrayDifference: ( items, excluded ) =>
			items.filter( ( item ) => !excluded.includes( item ) )
	};
	const ve = {
		init: { mw: { Target: baseTarget, targetFactory: { register: jest.fn() } } },
		copy: ( value ) => JSON.parse( JSON.stringify( value ) )
	};

	Function( 'mediaWiki', 'OO', 've', '$', targetSource )( mw, OO, ve, $ );
	Function( 'mediaWiki', 'OO', 've', '$', wideSource )( mw, OO, ve, $ );
} );

test( 'all normal and wide toolbar groups have stable names, preserving custom names', () => {
	const normal = mw.veForAll.Target.static.toolbarGroups;
	const wide = mw.veForAll.Targetwide.static.toolbarGroups;

	expect( normal.map( ( group ) => group.name ) ).toEqual( [
		'custom-format',
		'veforall-normal-1',
		'veforall-normal-2'
	] );
	expect( wide.map( ( group ) => group.name ) ).toEqual( [
		'veforall-wide-0',
		'custom-wide'
	] );

	expect( normal[ 0 ].header ).toBe( 'deferred:format' );
	expect( normal[ 1 ].title ).toBe( 'deferred:styles' );
	expect( wide[ 0 ].header ).toBe( 'deferred:format-wide' );
	// The client-side normalization must not mutate the original server config.
	expect( toolbarConfig.VEForAllToolbarNormal[ 1 ].name ).toBeUndefined();
	expect( toolbarConfig.VEForAllToolbarWide[ 0 ].name ).toBeUndefined();
} );

test( 'the default and switchable action groups are named', () => {
	expect( mw.veForAll.Target.static.actionGroups ).toEqual( [
		{ name: 'veforall-switch-editor', include: [ 've4aSwitchEditor' ] }
	] );

	mw.veForAll.Target.static.setSwitchable( true );
	expect( mw.veForAll.Target.static.actionGroups ).toEqual( [
		expect.objectContaining( {
			name: 'veforall-edit-mode',
			include: [ 'editModeVisual', 'editModeSource' ]
		} )
	] );

	mw.veForAll.Target.static.setSwitchable( false );
	expect( mw.veForAll.Target.static.actionGroups ).toEqual( [] );
} );

test.each( [ 'top', 'bottom' ] )(
	'attachToolbar initializes the %s toolbar only once without calling deprecated getActions',
	( position ) => {
		const $node = $( '<textarea>' ).appendTo( document.body );
		const $surface = $( '<div>' ).appendTo( document.body );
		const $toolbar = $( '<div>' );
		const initialize = jest.fn();
		const toolbar = {
			$element: $toolbar,
			getSurface: () => ( { $element: $surface } ),
			initialize
		};

		const target = Object.create( mw.veForAll.Target.prototype );
		target.$node = $node;
		target.toolbarPosition = position;
		target.getToolbar = jest.fn( () => toolbar );
		target.getActions = jest.fn();

		target.attachToolbar();

		expect( target.getToolbar ).toHaveBeenCalledTimes( 1 );
		expect( target.getActions ).not.toHaveBeenCalled();
		expect( initialize ).toHaveBeenCalledTimes( 1 );
		if ( position === 'top' ) {
			expect( $toolbar.next()[ 0 ] ).toBe( $surface[ 0 ] );
		} else {
			expect( $node.next()[ 0 ] ).toBe( $toolbar[ 0 ] );
		}
	}
);
