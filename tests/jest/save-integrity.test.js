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
let post;

beforeEach( async () => {
	document.body.className = '';
	document.body.innerHTML = '';
	post = jest.fn();
	mw = {
		config: { get: () => 'Test_page' },
		msg: ( key ) => key,
		notify: jest.fn(),
		log: { error: jest.fn() },
		Api: function () { this.post = post; }
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
		ui: { deferMsg: ( x ) => x },
		simpleArrayDifference: ( list ) => list
	};
	const ve = {
		init: { mw: { Target: Parent, targetFactory: { register: jest.fn() } } },
		copy: ( x ) => JSON.parse( JSON.stringify( x ) )
	};
	Function( 'mediaWiki', 'OO', 've', '$', source )( mw, OO, ve, $ );
	await flush();
} );

afterEach( () => {
	$( document ).off( 'mousedown', '#wpSave, #wpPreview, #wpDiff' );
	$( document ).off( 'submit', 'form' );
} );

function fixture() {
	const $form = $( '<form><textarea class="visualeditor ve-for-all-waiting-for-update">old</textarea></form>' )
		.appendTo( document.body );
	const $node = $form.find( 'textarea' ).hide();
	const target = Object.create( mw.veForAll.Target.prototype );
	target.$node = $node;
	target.$element = $( '<div>' );
	target.contentRevision = 1;
	target.pendingUpdatePromise = null;
	target.getSurface = () => ( { getHtml: () => '<p>new</p>' } );
	$node.data( 'veForAllTarget', target );
	return { $form, $node, target };
}

function submit( $form ) {
	return $form[ 0 ].dispatchEvent(
		new Event( 'submit', { bubbles: true, cancelable: true } )
	);
}

test( 'a failed conversion blocks submission, preserves edits and allows another attempt', async () => {
	const { $form, $node } = fixture();
	const requestSubmit = jest.fn();
	$form[ 0 ].requestSubmit = requestSubmit;
	post.mockReturnValueOnce( $.Deferred().reject( 'offline' ).promise() )
		.mockReturnValueOnce( $.Deferred().resolve( {
			'veforall-parsoid-utils': { content: 'updated' }
		} ).promise() );
	expect( submit( $form ) ).toBe( false );
	await flush();
	await flush();
	expect( requestSubmit ).not.toHaveBeenCalled();
	expect( mw.notify ).toHaveBeenCalledTimes( 1 );
	expect( $node.val() ).toBe( 'old' );
	expect( $node.hasClass( 've-for-all-waiting-for-update' ) ).toBe( true );
	expect( $node.hasClass( 'oo-ui-texture-pending' ) ).toBe( false );
	expect( $form.data( 'veforallSubmitPending' ) ).toBeUndefined();
	expect( submit( $form ) ).toBe( false );
	await flush();
	await flush();
	expect( requestSubmit ).toHaveBeenCalledTimes( 1 );
	expect( $node.val() ).toBe( 'updated' );
} );

test( 'stale Parsoid reply cannot overwrite a newer edit', async () => {
	const { $node, target } = fixture();
	const first = $.Deferred();
	const second = $.Deferred();
	const getHtml = jest.fn().mockReturnValueOnce( '<p>first</p>' )
		.mockReturnValueOnce( '<p>second</p>' );
	target.getSurface = () => ( { getHtml } );
	post.mockReturnValueOnce( first.promise() ).mockReturnValueOnce( second.promise() );

	const saving = target.updateContent();
	expect( target.updateContent() ).toBe( saving );
	target.contentRevision = 2;
	first.resolve( { 'veforall-parsoid-utils': { content: 'stale' } } );
	await flush();
	expect( $node.val() ).not.toBe( 'stale' );
	expect( post ).toHaveBeenCalledTimes( 2 );
	second.resolve( { 'veforall-parsoid-utils': { content: 'current' } } );
	await saving;
	expect( $node.val() ).toBe( 'current' );
	expect( $node.hasClass( 've-for-all-waiting-for-update' ) ).toBe( false );
} );

test( 'invalid Parsoid response rejects instead of silently saving old text', async () => {
	const { $node, target } = fixture();
	post.mockReturnValue( $.Deferred().resolve( {} ).promise() );
	await expect( Promise.resolve( target.updateContent() ) )
		.rejects.toThrow( 'invalid Parsoid' );
	expect( $node.hasClass( 've-for-all-waiting-for-update' ) ).toBe( true );
	expect( $node.hasClass( 'oo-ui-texture-pending' ) ).toBe( false );
} );

test( 'unchanged editor submits without a conversion request', () => {
	const { $form, $node } = fixture();
	$node.removeClass( 've-for-all-waiting-for-update' );
	expect( submit( $form ) ).toBe( true );
	expect( post ).not.toHaveBeenCalled();
} );

test( 'initializing editor must finish before submission resumes', async () => {
	const { $form, $node } = fixture();
	$node.removeData( 'veForAllTarget' ).removeClass( 've-for-all-waiting-for-update' );
	const d = $.Deferred();
	$node.data( 'veForAllPendingPromise', d.promise() );
	mw.veForAllWaitForPending = jest.fn( () => d.promise() );
	const requestSubmit = jest.fn();
	$form[ 0 ].requestSubmit = requestSubmit;
	expect( submit( $form ) ).toBe( false );
	expect( requestSubmit ).not.toHaveBeenCalled();
	d.resolve();
	await flush();
	await flush();
	expect( requestSubmit ).toHaveBeenCalledTimes( 1 );
} );

test( 'two submits in flight start only one conversion', async () => {
	const { $form } = fixture();
	const d = $.Deferred();
	post.mockReturnValue( d.promise() );
	expect( submit( $form ) ).toBe( false );
	expect( submit( $form ) ).toBe( false );
	await flush();
	expect( post ).toHaveBeenCalledTimes( 1 );
	d.resolve( { 'veforall-parsoid-utils': { content: 'current' } } );
	await flush();
} );

test( 'editor callback queues are not shared between instances', () => {
	const editor = fs.readFileSync(
		path.join( __dirname, '../../resources/ext.veforall.editor.js' ), 'utf8'
	);
	expect( editor ).toContain( 'this.initCallbacks = [];' );
	expect( editor ).not.toMatch( /Editor\.prototype\.initCallbacks\s*=\s*\[\]/ );
} );
