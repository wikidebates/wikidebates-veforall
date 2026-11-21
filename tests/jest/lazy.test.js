/** @jest-environment jsdom */
'use strict';

const fs = require( 'fs' );
const path = require( 'path' );
const $ = require( 'jquery' );
const source = fs.readFileSync( path.join( __dirname, '../../resources/VEForAll.js' ), 'utf8' );

const flush = () => new Promise( ( resolve ) => setTimeout( resolve, 0 ) );
let observe;
let editor;
let mw;

async function boot( config = {}, form = true ) {
	document.body.innerHTML = ( form ? '<form id="pfForm">' : '<div>' ) +
		'<textarea class="visualeditor" id="body">First</textarea>' +
		( form ? '</form>' : '</div>' );
	observe = undefined;
	window.IntersectionObserver = class {
		constructor( callback ) { this.callback = callback; this.elements = new Set(); observe = this; }
		observe( element ) { this.elements.add( element ); }
		unobserve( element ) { this.elements.delete( element ); }
	};
	const hooks = {};
	editor = jest.fn().mockImplementation( function ( element, initial ) {
		this.$node = $( element );
		this.initialContent = initial;
		this.readyPromise = Promise.resolve().then( () => {
			this.$node.data( 'veForAllTarget', { updateContent: () => Promise.resolve() } );
		} );
	} );
	const platformInit = jest.fn().mockResolvedValue();
	const using = jest.fn().mockResolvedValue();
	mw = {
		config: { get: ( key ) => config[ key ] },
		loader: { using },
		messages: { get: () => ( {} ) },
		message: ( key ) => ( { text: () => key } ),
		hook: ( name ) => {
			if ( !hooks[ name ] ) {
				const listeners = [];
				hooks[ name ] = {
					add: ( listener ) => listeners.push( listener ),
					fire: ( ...args ) => listeners.forEach( ( listener ) => listener( ...args ) )
				};
			}
			return hooks[ name ];
		},
		veForAll: { Editor: editor }
	};
	const ve = {
		init: { mw: { Platform: function () { this.initialize = platformInit; } },
			platform: { addMessages: jest.fn() } }
	};
	Function( 'jQuery', 'mediaWiki', 've', source )( $, mw, ve );
	// Page Forms can render after document.ready; exercise the real setup hook.
	if ( form ) {
		hooks[ 'pf.formSetupAfter' ].fire();
	}
	await flush();
	return { $field: $( '#body' ), using, platformInit, hooks, editor };
}

afterEach( () => {
	delete $.fn.applyVisualEditor;
	delete $.fn.getVEInstances;
	delete window.IntersectionObserver;
} );

test( 'offscreen Page Forms editor stays a native editable textarea', async () => {
	const env = await boot( { wgVEForAllLazyPageForms: true } );
	expect( observe.elements.has( env.$field[ 0 ] ) ).toBe( true );
	expect( env.using ).not.toHaveBeenCalled();
	expect( editor ).not.toHaveBeenCalled();
	expect( env.$field.prop( 'disabled' ) ).toBe( false );
} );

test( 'focus starts initialization and reads the most recent typed text', async () => {
	const env = await boot( { wgVEForAllLazyPageForms: true } );
	let release;
	env.using.mockReturnValueOnce( new Promise( ( resolve ) => { release = resolve; } ) );
	env.$field.trigger( 'focusin' );
	env.$field.val( 'Typed while loading' );
	expect( env.$field.prop( 'disabled' ) ).toBe( false );
	release();
	await mw.veForAllWaitForPending( $( '#pfForm' ) );
	expect( editor ).toHaveBeenCalledTimes( 1 );
	expect( editor.mock.instances[ 0 ].initialContent ).toBe( 'Typed while loading' );
	expect( env.$field.data( 'veForAllTarget' ) ).toBeTruthy();
} );

test( 'visibility can start the editor without a focus event', async () => {
	const env = await boot( { wgVEForAllLazyPageForms: true } );
	observe.callback( [ { target: env.$field[ 0 ], isIntersecting: true } ] );
	await mw.veForAllWaitForPending( $( '#pfForm' ) );
	expect( editor ).toHaveBeenCalledTimes( 1 );
	expect( env.using ).toHaveBeenCalledWith( [ 'ext.veforall.core', 'ext.veforall.core.desktop' ] );
} );

test( 'failed ResourceLoader fetch restores the textarea and allows retry', async () => {
	const env = await boot( { wgVEForAllLazyPageForms: true } );
	env.using.mockRejectedValueOnce( new Error( 'Network' ) );
	env.$field.trigger( 'focusin' );
	await expect( mw.veForAllWaitForPending( $( '#pfForm' ) ) ).rejects.toThrow( 'Network' );
	await flush();
	expect( env.$field.prop( 'disabled' ) ).toBe( false );
	expect( env.$field.val() ).toBe( 'First' );
	env.$field.trigger( 'pointerdown' );
	await mw.veForAllWaitForPending( $( '#pfForm' ) );
	expect( editor ).toHaveBeenCalledTimes( 1 );
	expect( env.using ).toHaveBeenCalledTimes( 2 );
} );

test( 'non-Page Forms use and disabled lazy option still start eagerly', async () => {
	let env = await boot( { wgVEForAllLazyPageForms: true }, false );
	await flush();
	expect( env.using ).toHaveBeenCalled();
	expect( editor ).toHaveBeenCalledTimes( 1 );
	env = await boot( { wgVEForAllLazyPageForms: false } );
	await flush();
	expect( env.using ).toHaveBeenCalled();
	expect( editor ).toHaveBeenCalledTimes( 1 );
} );

test( 'mobile Page Forms do not request desktop-only VE modules', async () => {
	const env = await boot( { wgVEForAllLazyPageForms: true, skin: 'minerva' } );
	env.$field.trigger( 'focusin' );
	await mw.veForAllWaitForPending( $( '#pfForm' ) );
	expect( env.using ).toHaveBeenCalledWith( [ 'ext.veforall.core' ] );
} );


test( 'failed editor readiness leaves the raw textarea usable for another attempt', async () => {
	const env = await boot( { wgVEForAllLazyPageForms: true } );
	const destroy = jest.fn();
	env.editor.mockImplementationOnce( function ( element ) {
		this.$node = $( element );
		this.readyPromise = Promise.reject( new Error( 'Parsoid offline' ) );
		this.destroy = destroy;
	} );
	env.$field.trigger( 'focusin' );
	await expect( mw.veForAllWaitForPending( $( '#pfForm' ) ) ).rejects.toThrow( 'Parsoid offline' );
	await flush();
	expect( destroy ).toHaveBeenCalledTimes( 1 );
	expect( env.$field.val() ).toBe( 'First' );
	expect( env.$field.prop( 'disabled' ) ).toBe( false );
	env.$field.trigger( 'pointerdown' );
	await mw.veForAllWaitForPending( $( '#pfForm' ) );
	expect( env.editor ).toHaveBeenCalledTimes( 2 );
} );
