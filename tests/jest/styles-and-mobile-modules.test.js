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

test( 'Minerva uses a small horizontal inset to align ordinary inputs without double padding', () => {
	const css = file( 'resources/mobileToolbarFix.css' );
	const mobileRule = css.match( /\.skin-minerva\s+#pfForm\s+\.ve-ce-documentNode\s*\{([^}]+)\}/ );
	expect( mobileRule ).not.toBeNull();
	expect( mobileRule[ 1 ] ).toMatch( /padding-inline:\s*0\.25rem\s*!important/ );
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
	expect( bar[ 1 ] ).toMatch( /overflow:\s*visible/ );
	expect( bar[ 1 ] ).not.toMatch( /overflow-x:\s*auto/ );
	const scrollport = css.match( /\.skin-minerva \.ve-area-wrapper \.ve-ui-toolbar > \.oo-ui-toolbar-bar > \.oo-ui-toolbar-tools:not\( \.oo-ui-toolbar-after \)\s*\{([^}]+)\}/ );
	expect( scrollport ).not.toBeNull();
	expect( scrollport[ 1 ] ).toMatch( /overflow-x:\s*auto/ );
	expect( scrollport[ 1 ] ).toMatch( /flex:\s*1 1 auto/ );
	expect( scrollport[ 1 ] ).toMatch( /min-width:\s*0/ );
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
	// Only the main button row scrolls; root, bar and popup overlay stay visible.
	expect( css ).not.toMatch( /\.ve-ui-toolbar\s*\{[^}]*overflow-x:\s*auto/s );
	expect( css ).toMatch( /\.ve-ui-toolbar\s*\{[^}]*overflow:\s*visible/s );
	expect( css ).toMatch( /> \.oo-ui-toolbar-bar\s*\{[^}]*overflow:\s*visible/s );
} );

test( 'Minerva gives adjacent VEForAll mobile buttons their intrinsic widths', () => {
	const css = file( 'resources/mobileToolbarFix.css' );
	expect( css ).toMatch(
		/\.skin-minerva \.ve-area-wrapper \.ve-ui-targetToolbar-mobile \.oo-ui-toolbar-tools > \.oo-ui-barToolGroup > \.oo-ui-toolGroup-tools > \.oo-ui-tool\s*\{\s*width:\s*auto\s*;/
	);
	// Never force OOUI popup contents themselves into flex layouts.
	expect( css ).not.toMatch( /\.oo-ui-toolGroup-tools\s*\{\s*display:\s*flex/ );
} );

test( 'Minerva aligns Paragraphe and reserves Wikicode action spacing', () => {
	const css = file( 'resources/mobileToolbarFix.css' );
	const start = css.indexOf( '.ve-ui-toolbar-group-veforall-normal-0.oo-ui-indicatorElement' );
	expect( start ).toBeGreaterThan( -1 );
	const handleRule = css.slice( start, css.indexOf( '}', start ) );
	expect( handleRule ).toMatch( /padding:\s*11px 24px 11px 12px !important/ );
	expect( handleRule ).toMatch( /min-width:\s*120px/ );
	expect( css ).toContain( '.ve-ui-toolbar-group-veforall-wide-0.oo-ui-indicatorElement' );
	const indicator = css.indexOf(
		'.ve-ui-toolbar-group-veforall-normal-0 > .oo-ui-popupToolGroup-handle > .oo-ui-indicatorElement-indicator'
	);
	expect( indicator ).toBeGreaterThan( -1 );
	const indicatorRule = css.slice( indicator, css.indexOf( '}', indicator ) );
	expect( indicatorRule ).toMatch( /left:\s*auto/ );
	expect( indicatorRule ).toMatch( /right:\s*0\.7em/ );
	expect( css ).toMatch(
		/\.skin-minerva \.ve-area-wrapper \.oo-ui-tool-name-ve4aSwitchEditor\s*\{\s*margin-inline-end:\s*12px\s*;/
	);
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


test( 'Minerva toolbar CSS is loaded only with a VEForAll editor, not globally on read pages', () => {
	const manifest = JSON.parse( file( 'extension.json' ) );
	expect( manifest.ResourceModules[ 'ext.veforall.main' ].styles ).toContain(
		'resources/mobileToolbarFix.css'
	);
	expect( file( 'includes/VEForAllHooks.php' ) ).not.toContain(
		"addModuleStyles( [ 'ext.veforall.mobileToolbar' ] )"
	);
} );
