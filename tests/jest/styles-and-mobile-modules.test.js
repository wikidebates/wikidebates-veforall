/** @jest-environment jsdom */
'use strict';

const fs = require( 'fs' );
const path = require( 'path' );
const root = path.join( __dirname, '../..' );

function file( name ) {
	return fs.readFileSync( path.join( root, name ), 'utf8' );
}

test( 'Page Forms visual-editor content keeps its horizontal padding', () => {
	const css = file( 'resources/VEForAll.css' );
	const rule = css.match( /#pfForm\s+\.ve-ce-documentNode\s*\{([^}]+)\}/ );
	expect( rule ).not.toBeNull();
	expect( rule[ 1 ] ).toMatch( /padding-left:\s*0\.75rem\s*!important/ );
	expect( rule[ 1 ] ).toMatch( /padding-right:\s*0\.75rem\s*!important/ );
} );

test( 'integrated Minerva toolbar styles affect only VEForAll editor wrappers', () => {
	const css = file( 'resources/mobileToolbarFix.css' );
	const selectors = css.split( '\n' )
		.map( ( line ) => line.trim() )
		.filter( ( line ) => line.startsWith( '.skin-minerva' ) );
	expect( selectors.length ).toBeGreaterThan( 5 );
	selectors.forEach( ( selector ) => {
		expect( selector ).toContain( '.skin-minerva .ve-area-wrapper' );
	} );
	expect( css ).toMatch( /overflow-x:\s*auto/ );
	expect( css ).toMatch( /flex-wrap:\s*nowrap/ );
} );

test( 'mobile bundle depends only on existing MediaWiki 1.43 module names', () => {
	const manifest = JSON.parse( file( 'extension.json' ) );
	const mobile = manifest.ResourceModules[ 'ext.veforall.core.mobile' ];
	const styles = manifest.ResourceModules[ 'ext.veforall.mobileToolbar' ];
	expect( mobile.dependencies ).toEqual( [
		'ext.veforall.core',
		'ext.visualEditor.core.mobile',
		'ext.visualEditor.mwcore'
	] );
	expect( mobile.dependencies ).not.toContain( 'ext.visualEditor.mobile' );
	expect( styles.styles ).toEqual( [ 'resources/mobileToolbarFix.css' ] );
} );
