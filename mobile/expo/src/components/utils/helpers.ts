 
import { AlphaType, BlendMode, ColorType, FilterMode, MipmapMode, processUniforms, SkColor, Skia, SkImage, SkImageFilter, SkRuntimeEffect, SkShader, SkSurface, TileMode } from "@shopify/react-native-skia";
import { Directory, File, Paths } from 'expo-file-system';
import { Alert, Platform } from 'react-native'; 
 
import { removeBackgroundAsync } from 'expo-background-remover'; 
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'; 
import JSZip from 'jszip'; 
 
export const writeToFile = (savedFileUri:string,filebytes:Uint8Array):string => {
    try {
      const file = new File(Paths.cache,savedFileUri);
      file.create({overwrite:true}); // can throw an error if the file already exists or no permission to create it
       
      file.write(filebytes); 

      return file.uri;

    } catch (error) {
      alert("Error write file, error code 281: " + error);
    }
}


export const create_zip_from_files = async (fileUris:string[]): Promise<string> => {
     var zipUri = ''; 

     try{ 
            const cacheDir   = Paths.cache;
            const sessionId  = String(Date.now());
            const workFolder = `${cacheDir}magic_3dstudio_${sessionId}/`;
            const subFolder = `sf_magic_3dstudio_${sessionId}/`; 

            const directory = new Directory(Paths.cache, subFolder);
            directory.create({idempotent:true});
 
            const zipInstance = new JSZip();

            for (let i = 0; i < fileUris.length; i++) { 

                const skData  = await Skia.Data.fromURI(fileUris[i]);
                const skImg   = await Skia.Image.MakeImageFromEncoded(skData);
                var image_bytes = skImg.encodeToBytes(); 

                const finalName = `magic_studio_${String(i + 1).padStart(3, '0')}.png`;
                zipInstance.file(finalName, image_bytes); 
            }
 
            const zipName = `magic_studio_${sessionId}.zip`; 

            // Generate the zip as a Uint8Array
            const zipData = await zipInstance.generateAsync({ type: 'uint8array' });
            
            zipUri = await writeToFile(zipName,zipData);

            
     }catch(ex){
        console.log('Error during making zip file:' + ex.message())
     }
     finally{
      return zipUri;
     }
}


export const removeBackground_Native_v2 = async (imageUri:string,isDownscaleInput:boolean,isDownscaleOutput:boolean,isScaleOutputToOriginal:boolean,mode:string,isSaveToFile:boolean): Promise<[SkImage,string]> => {
    var skiaImage:SkImage = null;
    var skiaUri:string = null;

    var inputImageUri = imageUri;

    var original_imageData = await Skia.Data.fromURI(imageUri);
    var original_skiaImage = await Skia.Image.MakeImageFromEncoded(original_imageData);  

    var original_width = original_skiaImage.width();
    var original_height = original_skiaImage.height(); 

    try{

      if(isDownscaleInput){
         var manipResult = await manipulateAsync(
                            imageUri,
                            [ {resize: {width:512} }],
                            { compress: 1, format: SaveFormat.PNG }
                          );      
                    
         inputImageUri = manipResult.uri;
      } 
    
      var removedBackgroundImageUri = await removeBackgroundAsync(inputImageUri);   

      if(!removedBackgroundImageUri.includes("file://")){  // && Platform.OS == "android"){
          removedBackgroundImageUri = "file://" + removedBackgroundImageUri
      }  

      //foreground image is available:
      var imageData = await Skia.Data.fromURI(removedBackgroundImageUri);
      skiaImage = await Skia.Image.MakeImageFromEncoded(imageData);   
  
      if(isDownscaleOutput){
          var width = skiaImage.width();
          var height = skiaImage.height();
          var downscale_width = Math.round(width/2);
          var downscale_height = Math.round(height/2);

          var downscale_surface = Skia.Surface.MakeOffscreen(downscale_width,downscale_height);
          var downscale_canvas = downscale_surface.getCanvas();

           const sourceRect = Skia.XYWHRect(0, 0, width, height); 

           const destRect = Skia.XYWHRect(0, 0, downscale_width, downscale_height);

           const paint = Skia.Paint(); 
           paint.setAntiAlias(true);   
                    
          downscale_canvas.drawImageRectCubic(skiaImage, sourceRect, destRect,1/3,1/3, paint);
          skiaImage = downscale_surface.makeImageSnapshot().makeNonTextureImage(); 
           downscale_surface.dispose();
      }

      if(isScaleOutputToOriginal){
        var width = skiaImage.width();
        var height = skiaImage.height(); 

        var surface = Skia.Surface.MakeOffscreen(original_width,original_height);
        var canvas = surface.getCanvas();

        const sourceRect = Skia.XYWHRect(0, 0, width, height); 

        const destRect = Skia.XYWHRect(0, 0, original_width, original_height);

        const paint = Skia.Paint(); 
        paint.setAntiAlias(true);   
                    
        canvas.drawImageRectCubic(skiaImage, sourceRect, destRect,1/3,1/3, paint);
        skiaImage = surface.makeImageSnapshot().makeNonTextureImage(); 
        surface.dispose();
      }

      if(isSaveToFile){
         var imageName = 'ai-imagetoolkit-hd-rembg-' + String(Date.now())  + '.png';
         var image_bytes = skiaImage.encodeToBytes();
         skiaUri = await writeToFile(imageName,image_bytes);
      } 


    }catch(ex){
        Alert.alert('Warning','Error during background removal:' + ex.toString());
    }finally{
        return [skiaImage,skiaUri];
    }
}