/** @jest-environment jsdom */
'use strict';

const fs = require( 'fs' );
const path = require( 'path' );
const $ = require( 'jquery' );
const source = fs.readFileSync(
	path.join( __dirname, '../../resources/ext.veforall.target.js' ), 'utf8'
);
const flush = () => new Promise( ( resolve ) => setTimeout( resolve, 0 ) );

let mw;

beforeEach( () => {
	document.body.innerHTML = '';
	mw = {
		config: { get: ( name ) => name === 'VEForAllToolbarNormal' ? [] : 'Test' },
		msg: ( name ) => name,
		notify: jest.fn(),
		log: { error: jest.fn() }
	};
	const Parent = function () {};
	Parent.static = { importRules: { external: { blacklist: [] } } };
	const OO = {
		inheritClass: ( Child, Base ) => {
			Child.parent = Base;
			Child.prototype = Object.create( Base.prototype );
			Child.prototype.constructor = Child;
			Child.static = Object.create( Base.static );
		},
		ui: { deferMsg: ( name ) => name },
		simpleArrayDifference: ( list ) => list
	};
	const ve = {
		init: { mw: { Target: Parent, targetFactory: { register: jest.fn() } } },
		copy: ( x ) => JSON.parse( JSON.stringify( x ) )
	};
	Function( 'mediaWiki', 'OO', 've', '$', source )( mw, OO, ve, $ );
} );

afterEach( () => {
	$( document ).off( 'mousedown', '#wpSave, #wpPreview, #wpDiff' );
	$( document ).off( 'submit', 'form' );
} );

function escape( text ) {
	return mw.veForAll.Target.prototype.escapePipesInTables( text );
}

test( 'table start, caption, spanning cells, closing marker and outside text are handled', () => {
	const input = [
		'Outside | preserved',
		'{| class="wikitable"',
		'|+ Heading | more',
		'|-',
		'| rowspan="2" | A || B',
		'|}',
		'After | preserved'
	].join( '\n' );
	expect( escape( input ) ).toBe( [
		'Outside | preserved',
		'{{{!}} class="wikitable"',
		'{{!}}+ Heading {{!}} more',
		'{{!}}-',
		'{{!}} rowspan="2" {{!}} A {{!}}{{!}} B',
		'{{!}}}',
		'After | preserved'
	].join( '\n' ) );
} );

test( 'nested tables keep escaping outer rows after an inner table closes', () => {
	expect( escape( '{|\n|Outer\n{|\n|Inner\n|}\n|Still outer\n|}' ) )
		.toBe( '{{{!}}\n{{!}}Outer\n{{{!}}\n{{!}}Inner\n{{!}}}\n{{!}}Still outer\n{{!}}}' );
} );

test( 'nested template parameters and wikilinks remain unchanged within a table cell', () => {
	const input = '{|\n| [[Page|Label]] {{Template|key=value}} || Other\n|}';
	const output = '{{{!}}\n{{!}} [[Page|Label]] {{Template|key=value}} {{!}}{{!}} Other\n{{!}}}';
	expect( escape( input ) ).toBe( output );
} );

test( 'already escaped table markers are stable across repeated conversions', () => {
	const original = '{{{!}}\n{{!}} A {{!}}{{!}} B\n{{!}}}';
	expect( escape( original ) ).toBe( original );
	expect( escape( escape( '{|\n| A || B\n|}' ) ) )
		.toBe( escape( '{|\n| A || B\n|}' ) );
} );

function switchFixture( sourceMode ) {
	const $wrapper = $( '<div class="ve-area-wrapper"></div>' ).appendTo( document.body );
	const $node = $( '<textarea>Original wikicode</textarea>' ).appendTo( $wrapper );
	const $icon = $( '<span>' ).addClass(
		sourceMode ? 'oo-ui-icon-eye' : 'oo-ui-icon-wikiText'
	).appendTo( $wrapper );
	const $link = $( '<a class="oo-ui-tool-link"></a>' )
		.attr( 'title', sourceMode ? 'visualeditor-welcomedialog-switch-ve' :
			'veforall-switch-editor-tool-title' ).appendTo( $wrapper );
	const $surface = $( '<div class="surface">Visual content</div>' ).appendTo( $wrapper );
	if ( !sourceMode ) {
		$node.hide();
	}
	// jsdom has no layout; represent visibility through getClientRects.
	$node[ 0 ].getClientRects = () =>
		$node.css( 'display' ) === 'none' ? [] : [ { width: 100 } ];
	const target = Object.create( mw.veForAll.Target.prototype );
	target.$node = $node;
	target.getSurface = jest.fn( () => ( {
		$element: $surface,
		getView: () => ( { focus: jest.fn() } )
	} ) );
	target.clearSurfaces = jest.fn();
	return { target, $node, $icon, $link, $surface };
}

test( 'failed source-to-visual conversion preserves icon, label and source; retry succeeds', async () => {
	const { target, $node, $icon, $link } = switchFixture( true );
	const first = $.Deferred(), retry = $.Deferred();
	target.convertToHtml = jest.fn().mockReturnValueOnce( first.promise() )
		.mockReturnValueOnce( retry.promise() );

	const firstPromise = target.switchEditor();
	expect( target.switchEditor() ).toBe( firstPromise );
	expect( target.convertToHtml ).toHaveBeenCalledTimes( 1 );
	expect( $icon.hasClass( 'oo-ui-icon-eye' ) ).toBe( true );
	expect( $link.attr( 'title' ) ).toBe( 'visualeditor-welcomedialog-switch-ve' );
	first.reject( 'network' );
	await flush();
	expect( target.switchEditorPending ).toBeNull();
	expect( $node.val() ).toBe( 'Original wikicode' );
	expect( $icon.hasClass( 'oo-ui-icon-eye' ) ).toBe( true );
	expect( mw.notify ).toHaveBeenCalledWith(
		'veforall-switch-conversion-failed', { type: 'error' }
	);

	target.switchEditor();
	retry.resolve();
	await flush();
	expect( target.convertToHtml ).toHaveBeenCalledTimes( 2 );
	expect( $icon.hasClass( 'oo-ui-icon-wikiText' ) ).toBe( true );
	expect( $link.attr( 'title' ) ).toBe( 'veforall-switch-editor-tool-title' );
} );

test( 'failed visual-to-source conversion preserves editor and label; retry succeeds', async () => {
	const { target, $node, $icon, $link, $surface } = switchFixture( false );
	const first = $.Deferred(), retry = $.Deferred();
	target.updateContent = jest.fn().mockReturnValueOnce( first.promise() )
		.mockReturnValueOnce( retry.promise() );

	const attempt = target.switchEditor();
	expect( target.switchEditor() ).toBe( attempt );
	expect( target.updateContent ).toHaveBeenCalledTimes( 1 );
	expect( $icon.hasClass( 'oo-ui-icon-wikiText' ) ).toBe( true );
	first.reject( 'parsoid' );
	await flush();
	expect( target.switchEditorPending ).toBeNull();
	expect( $node.css( 'display' ) ).toBe( 'none' );
	expect( $surface.css( 'display' ) ).not.toBe( 'none' );
	expect( $icon.hasClass( 'oo-ui-icon-wikiText' ) ).toBe( true );
	expect( $link.attr( 'title' ) ).toBe( 'veforall-switch-editor-tool-title' );
	expect( mw.notify ).toHaveBeenCalledWith(
		'veforall-switch-conversion-failed', { type: 'error' }
	);

	target.switchEditor();
	retry.resolve();
	await flush();
	expect( target.updateContent ).toHaveBeenCalledTimes( 2 );
	expect( $node.css( 'display' ) ).not.toBe( 'none' );
	expect( $surface.css( 'display' ) ).toBe( 'none' );
	expect( $icon.hasClass( 'oo-ui-icon-eye' ) ).toBe( true );
	expect( $link.attr( 'title' ) ).toBe( 'visualeditor-welcomedialog-switch-ve' );
} );
