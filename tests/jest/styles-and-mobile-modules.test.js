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

test( 'Minerva retains one existing form inset rather than adding the desktop inset again', () => {
	const css = file( 'resources/mobileToolbarFix.css' );
	const mobileRule = css.match( /\.skin-minerva\s+#pfForm\s+\.ve-ce-documentNode\s*\{([^}]+)\}/ );
	expect( mobileRule ).not.toBeNull();
	expect( mobileRule[ 1 ] ).toMatch( /padding-inline:\s*0\s*!important/ );
	// The desktop rule is kept as a fallback for Vector-2022.
	expect( file( 'resources/VEForAll.css' ) ).toMatch( /padding-left:\s*0\.75rem\s*!important/ );
} );

test( 'Minerva toolbar groups remain on one horizontally scrollable row', () => {
	const css = file( 'resources/mobileToolbarFix.css' );
	const selectors = css.split( '\n' )
		.map( ( line ) => line.trim() )
		.filter( ( line ) => line.startsWith( '.skin-minerva' ) );
	expect( selectors.length ).toBeGreaterThanOrEqual( 5 );
	selectors.forEach( ( selector ) => {
		expect( selector ).toMatch( /^\.skin-minerva (\.ve-area-wrapper|#pfForm)/ );
	} );
	const bar = css.match( /\.skin-minerva \.ve-area-wrapper \.ve-ui-toolbar > \.oo-ui-toolbar-bar\s*\{([^}]+)\}/ );
	expect( bar ).not.toBeNull();
	expect( bar[ 1 ] ).toMatch( /display:\s*flex/ );
	expect( bar[ 1 ] ).toMatch( /flex-wrap:\s*nowrap/ );
	expect( bar[ 1 ] ).toMatch( /overflow-x:\s*auto/ );
	// Both regular tools and the right-aligned action group are bar children.
	expect( css ).toContain( '> .oo-ui-toolbar-bar > .oo-ui-toolbar-tools' );
	expect( css ).toContain( '> .oo-ui-toolbar-bar > .oo-ui-toolbar-actions' );
	expect( css ).toMatch( /flex:\s*0 0 auto/ );
	expect( css ).toMatch( /white-space:\s*nowrap\s*!important/ );
} );

test( 'Minerva toolbar styling does not reshape OOUI dropdown menus', () => {
	const css = file( 'resources/mobileToolbarFix.css' );
	// The popup container is outside OOUI's toolbar bar.
	expect( css ).not.toMatch( /\.oo-ui-toolbar-popups\s*\{/ );
	expect( css ).not.toMatch( /\.oo-ui-toolGroup-tools\s*\{/ );
	expect( css ).not.toMatch( /\.oo-ui-widget\.oo-ui-buttonTool\s*[,\{]/ );
	// Scrolling belongs to the bar rather than the popup overlay.
	expect( css ).not.toMatch( /\.ve-ui-toolbar\s*\{[^}]*overflow-x:\s*auto/s );
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
