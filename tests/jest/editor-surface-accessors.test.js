/** @jest-environment jsdom */
'use strict';

const fs = require( 'fs' );
const path = require( 'path' );
const $ = require( 'jquery' );
const source = fs.readFileSync(
	path.join( __dirname, '../../resources/ext.veforall.editor.js' ),
	'utf8'
);
let Editor;

beforeAll( () => {
	const mw = { veForAll: {}, config: { get: () => ({ pluginModules: [] }) } };
	const OO = {
		EventEmitter: function () {},
		mixinClass: ( Child ) => { Child.static = {}; }
	};
	Function( 'jQuery', 'mediaWiki', 'OO', 've', source )( $, mw, OO, {} );
	Editor = mw.veForAll.Editor;
} );

test( 'unavailable surfaces are safe', () => {
	const editor = Object.create( Editor.prototype );
	expect( editor.getRawContent() ).toBe( '' );
	expect( editor.isEmpty() ).toBe( true );
	editor.target = { getSurface: () => null };
	expect( editor.getRawContent() ).toBe( '' );
	expect( editor.isEmpty() ).toBe( true );
} );

test( 'HTML is read from the current target surface', () => {
	const editor = Object.create( Editor.prototype );
	editor.target = { getSurface: () => ( {
		getHtml: () => '<p>Latest <b>content</b></p>'
	} ) };
	expect( editor.getRawContent() ).toBe( '<p>Latest <b>content</b></p>' );
} );

test( 'isEmpty inspects the current model rather than the unset Editor.dmDoc', () => {
	const editor = Object.create( Editor.prototype );
	const countNonInternalElements = jest.fn().mockReturnValueOnce( 4 )
		.mockReturnValueOnce( 2 );
	editor.target = { getSurface: () => ( {
		getModel: () => ( {
			getDocument: () => ( { data: { countNonInternalElements } } )
		} )
	} ) };
	expect( editor.isEmpty() ).toBe( false );
	expect( editor.isEmpty() ).toBe( true );
} );
