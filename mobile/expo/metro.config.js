const { getDefaultConfig } = require("expo/metro-config");

const path = require('path'); 
const root = path.resolve(__dirname, '../..'); 

module.exports = (async () => { 
  const config = await getDefaultConfig(__dirname); 
  
  config.resolver.unstable_enablePackageExports = true; 
  config.resolver.unstable_conditionNames = ['react-native', 'require', 'import'];


  const fs = require('fs'); 

  const EMPTY_SHIM = path.resolve(__dirname, 'shims/empty.js');

  // three r152+ renamed three.cjs.js → three.cjs. Detect which exists.
  const THREE_CJS_JS = path.resolve(__dirname, 'node_modules/three/build/three.cjs.js');
  const THREE_CJS = path.resolve(__dirname, 'node_modules/three/build/three.cjs');
  const ROOT_THREE_CJS = fs.existsSync(THREE_CJS_JS) ? THREE_CJS_JS : THREE_CJS; 

   const {transformer,resolver} = config; 
   
   config.transformer = {
      ...transformer, 
      assetPlugins: ['expo-asset/tools/hashAssetFiles'],
      getTransformOptions: async () => ({
        transform: {
          experimentalImportSupport: false,
          inlineRequires: true,
          assetPlugins:['expo-asset/tools/hasAssetFiles'],
        },
      }),
    }; 

    config.resolver= {
      ...resolver, 
      sourceExts: [...config.resolver.sourceExts, 'svg', 'd.ts'],
      assetExts: [...resolver.assetExts.filter((ext) => ext !== 'svg'),
        "obj",
        "mtl",
        "mp3",
        "mp4",
        "jpg",
        "JPG",
        "vrx",
        "hdr",
        "gltf",
        "glb",
        "bin",
        "arobject",
        "gif",
        "png",
        "jpeg",
        "json",
        "ptl",
        "tflite",
        "filamat",
        "pte",
        "svg",
        "pps",
        "html"
      ],
      assetPlugins: ["expo-asset/tools/hashAssetFiles"],

      extraNodeModules: {
      ...config.resolver.extraNodeModules,
      three: path.resolve(__dirname, 'node_modules/three'), 
      }, 

      resolveRequest: (context, moduleName, platform) => {  

        // Redirect any three import to the CJS build.
        if (
          moduleName === 'three' ||
          moduleName === 'three/src/Three.js' ||
          moduleName === 'three/build/three.module.js' ||
          moduleName === 'three/build/three.cjs.js' // redirect old explicit imports
        ) {
          return { filePath: ROOT_THREE_CJS, type: 'sourceFile' };
        }

        // Shim InternalBytecode regardless of whether it arrives as:
        // "InternalBytecode" bare specifier
        // "./InternalBytecode" relative
        // "/abs/path/InternalBytecode.js" absolute (after prior resolution)
        if (moduleName.includes('InternalBytecode')) {
          return { filePath: EMPTY_SHIM, type: 'sourceFile' };
        }
   
        // Let Metro handle other modules
        return context.resolveRequest(context, moduleName, platform);
      }  
    }; 

     
        config.resolver.blockList = [
          // Block any nested `three` that isn't the root installation.
          /node_modules[/\\](?!three[/\\]).*[/\\]node_modules[/\\]three[/\\]/,
      ];


      // ─── 3. Allow CJS extensions ───────────────────────────────────────────────
      //
      // Metro needs to know .cjs files are valid source.
      //
      config.resolver.sourceExts = [
      ...config.resolver.sourceExts.filter((e) => e !== 'cjs'),
      'cjs',
      ];
  
  return config;
  
})();