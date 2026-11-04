package aiillustwitter;
 
import org.jcodec.api.awt.AWTSequenceEncoder;
import org.jcodec.common.io.NIOUtils;
import org.jcodec.common.model.Rational;
  
import org.apache.http.entity.mime.content.FileBody;
import org.apache.http.entity.mime.content.ByteArrayBody;

import org.apache.commons.math3.analysis.function.Sinc;
import org.apache.commons.math3.complex.Complex;
 
import aiillustwitter.Agents.SceneResult;
  
import org.apache.commons.lang3.StringUtils;
  

import java.io.IOException;

import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.HttpEntity;
import org.apache.http.HttpHeaders;
import org.apache.http.HttpRequest;
import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.client.methods.HttpPost;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClients;
import org.apache.http.util.EntityUtils;
import org.apache.http.entity.StringEntity;

import java.math.BigInteger;
 
import com.google.gson.annotations.SerializedName;

import org.apache.http.entity.ContentType;
import org.json.JSONArray;
import org.json.JSONObject; 

import java.io.File;
import java.io.IOException;
 
import java.net.MalformedURLException;
import java.net.URL;
import org.apache.commons.io.FileUtils;
 
import org.apache.http.HttpResponse;
import org.apache.http.client.ClientProtocolException;
import org.apache.http.client.ResponseHandler;
import org.apache.http.client.methods.HttpGet;
 
import org.apache.http.impl.client.LaxRedirectStrategy;

import java.io.InputStream;
import java.io.FileNotFoundException;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.amazonaws.auth.AWSStaticCredentialsProvider;
import com.amazonaws.AmazonServiceException;
import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.S3Event;
import com.amazonaws.services.s3.AmazonS3;
import com.amazonaws.services.s3.event.S3EventNotification.S3EventNotificationRecord;
import com.amazonaws.services.s3.model.CannedAccessControlList;
import com.amazonaws.services.s3.model.GetObjectRequest;
import com.amazonaws.services.s3.model.PutObjectRequest;
import com.amazonaws.services.s3.model.ObjectMetadata;
import com.amazonaws.services.s3.model.S3Object;
import com.amazonaws.services.s3.AmazonS3ClientBuilder;
import com.amazonaws.services.s3.model.ResponseHeaderOverrides;
import com.amazonaws.regions.Regions;
import com.amazonaws.services.s3.model.S3ObjectInputStream;

import com.amazonaws.auth.BasicAWSCredentials;
import com.amazonaws.services.s3.model.PutObjectRequest;
 
import com.amazonaws.services.s3.model.CopyObjectRequest;
import com.amazonaws.services.s3.model.CopyObjectResult;

import java.io.File;
import java.nio.ByteBuffer;
import java.nio.channels.SeekableByteChannel;
import java.nio.charset.StandardCharsets;
 

import org.apache.http.HttpResponse;
import org.apache.http.client.ClientProtocolException;
import java.io.IOException;

import java.io.FileInputStream;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.List;
 
import org.apache.commons.httpclient.HttpStatus;

import org.apache.http.entity.mime.MultipartEntityBuilder; 

import java.util.concurrent.TimeUnit;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Protocol;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.MultipartBody;

import okhttp3.MultipartBody.Builder;
 
import okio.BufferedSink;
import okio.Okio;
import okio.Source;

import org.apache.commons.codec.binary.Base64;
  
import static java.lang.Math.*;
 
import java.net.*;
 

//----------------------------------------------------------------------------------------------------------------------------

//MAGIC STUDIO AGENTS

//----------------------------------------------------------------------------------------------------------------------------
import java.time.Duration;

import java.util.concurrent.ConcurrentHashMap;
import java.nio.charset.StandardCharsets;
import com.google.gson.*;
import java.util.*;

import com.google.javascript.jscomp.*;
import com.google.javascript.rhino.Node;
import com.google.javascript.rhino.Token;
import java.util.*;
import java.util.regex.Pattern;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.ThreadLocalRandom;
 
import java.net.URI;
 
import java.util.ArrayList;
 
/**
 * One piece of the user message ("multipart content"): a labelled text block (prompt, capability list, scene spec, SDK doc, errors...)
 * or an image. The pieces are sent in order as separate parts of ONE JSON request, so each input stays clearly separated for the model.
 */
record Part(boolean image, String label, String value) {
  static Part text(String label, String text) { return new Part(false, label, text == null ? "" : text); }
  static Part image(String label, String base64) { return new Part(true, label, base64); }
  /** text rendered with its label, e.g. "### CAPABILITY LIST\n..." */
  String rendered() { return "### " + label + "\n" + value; }
}

/**
 * Per-call model settings. A null / blank value is NOT sent (some reasoning models reject temperature / top_p).
 * reasoningEffort: minimal | low | medium | high ("reasoning":{"effort":...}). maxOutputTokens includes the reasoning tokens.
 */
record LlmParams(Double temperature, Double topP, String reasoningEffort, int maxOutputTokens) {}
 

final class LlmClient { 
  // Constants as requested. They come from the environment so no key is ever in source; hard-code them here if you really want to.
 
	static final String META_MUSE_URL = "https://api.meta.ai/v1/responses";
	static final String META_MUSE_API_KEY = "YOUR_META_API_KEY"; 
	static final String META_MODEL_NAME = "muse-spark-1.3";


	static final String MODAL_URL = "YOUR MODAL URL"; 
	static final String MODAL_API_KEY = "";
	static final String MODAL_MODEL_NAME = "meta-models/Muse-Spark-Open-816B-A42B"; 

  /** The request body follows the shape ("input", "input_text", "max_output_tokens", "reasoning", "text.format"). */
  /** true = image part exactly as in your sample {"type":"image_url","image_url":{"url":"data:..."}};  false = {"type":"input_image","image_url":"data:..."} */
  static final boolean IMAGE_PART_AS_SAMPLE = !"false".equalsIgnoreCase(env("IMAGE_PART_AS_SAMPLE", "true"));

//    static final String MAX_TOKENS_FIELD = "max_tokens";// META: "max_output_tokens"; MODAL =  "max_tokens"
   /** true = also send "response_format":{"type":"json_object"} (only if your server supports it; the prompts already ask for JSON). */
  static final boolean JSON_MODE = "true".equalsIgnoreCase(env("JSON_MODE", "false")); 

  private static final Gson GSON = new Gson();
  
  /** Sends the parts as one user message and returns the model's text reply. */
  static String complete(String model, String system, List<Part> parts, LlmParams params) throws IOException, InterruptedException {
    return museSpark(model, system, parts, params);
  }

  // ------------------------------------------------------------------ (Apache HttpClient 5)
  /**
   * Produces exactly this request (same key order, image part BEFORE the text part, no extra fields):
   * {
   *   "model": "magic-models",
   *   "messages": [
   *     { "role": "system", "content": "<instructions>" },
   *     { "role": "user", "content": [
   *         { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } },     (one per image, in order)
   *         { "type": "text", "text": "<ALL text inputs in one block; images are announced as [Image 1: ...]>" } ] }
   *   ],
   *   "temperature": 1,
   *   "max_tokens": 86868,
   *   "stream": false,
   *   "reasoning_effort": "medium"
   * }
   * "top_p" is only sent when TOP_P is set (it is not in your working sample); "response_format" only when JSON_MODE=true.
   */

  private static String museSpark(String model, String system, List<Part> parts, LlmParams params) throws IOException {

	String API_URL = META_MUSE_URL;
	String API_KEY = META_MUSE_API_KEY;
	String API_MODEL_NAME = "meta-models/Muse-Spark-Open-816B-A42B"; //MODAL name

	//CAN DO SIMPLE ROUND ROBIN LOAD BALANCE HERE
	int iRandom = 1;
	String endpointProviderName = "MODAL"; 

	var MAX_TOKENS_FIELD = "max_tokens";

	switch(iRandom){ 
	case 1:
		 API_URL = MODAL_URL;
		 API_KEY = MODAL_API_KEY;
		 endpointProviderName = "MODAL";
		 MAX_TOKENS_FIELD = "max_tokens";
		 API_MODEL_NAME = MODAL_MODEL_NAME;
		 break;
	case 2:
		 API_URL = META_MUSE_URL;
		 API_KEY = META_MUSE_API_KEY;
		 endpointProviderName = "META";
		 MAX_TOKENS_FIELD = "max_output_tokens";
		 API_MODEL_NAME = META_MODEL_NAME;

		 //TEST MUSE WONDER:
		 endpointProviderName = "META MUSE WONDER";
		 API_MODEL_NAME = "muse-wonder-1.0";

		 break;  

	default:
		 API_URL = MODAL_URL;
		 API_KEY = MODAL_API_KEY;
		 endpointProviderName = "MODAL";
		 MAX_TOKENS_FIELD = "max_tokens";
		 API_MODEL_NAME = MODAL_MODEL_NAME;
		 break; 
	} 

	boolean isModal = endpointProviderName != null && endpointProviderName.startsWith("MODAL");

	StringBuilder text = new StringBuilder();
	JsonArray messages = new JsonArray();

	// 1. Add System Message if present
	if (system != null && !system.isBlank()) {
	JsonObject sys = new JsonObject();
	sys.addProperty("role", "system");
	sys.addProperty("content", system);
	messages.add(sys);
	}

	// 2. Check for image parts
	boolean hasImages = false;
	for (Part p : parts) {
	if (p.image() && p.value() != null && !p.value().isBlank()) {
		hasImages = true;
		break;
	}
	}

	JsonObject user = new JsonObject();
	user.addProperty("role", "user");

	if (isModal) {
	// MODAL Format: Plain string content for text-only, array of blocks for multimodal
	if (hasImages) {
		JsonArray content = new JsonArray();
		int n = 0;
		for (Part p : parts) {
		if (p.image()) {
			if (p.value() == null || p.value().isBlank()) continue;
			n++;
			text.append("[Image ").append(n).append(": ").append(p.label()).append("]\n\n");
			JsonObject url = new JsonObject();
			url.addProperty("url", "data:" + mediaType(p.value()) + ";base64," + stripDataUri(p.value()));
			JsonObject img = new JsonObject();
			img.addProperty("type", "image_url");
			img.add("image_url", url);
			content.add(img);
		} else {
			text.append(p.rendered()).append("\n\n");
		}
		}
		if (!text.toString().isBlank()) {
		JsonObject textPart = new JsonObject();
		textPart.addProperty("type", "text");
		textPart.addProperty("text", text.toString().strip());
		content.add(textPart);
		}
		user.add("content", content);
	} else {
		for (Part p : parts) {
		text.append(p.rendered()).append("\n\n");
		}
		user.addProperty("content", text.toString().strip());
	}
	} else {
	// Non-MODAL Format: Structured "input_text" and "input_image" blocks with base64 image_url
	JsonArray content = new JsonArray();
	JsonArray imageParts = new JsonArray();
	int n = 0;

	for (Part p : parts) {
		if (p.image()) {
		if (p.value() == null || p.value().isBlank()) continue;
		n++;
		text.append("[Image ").append(n).append(": ").append(p.label()).append("]\n\n");
		
		JsonObject img = new JsonObject();
		img.addProperty("type", "input_image");
		img.addProperty("image_url", "data:" + mediaType(p.value()) + ";base64," + stripDataUri(p.value()));
		imageParts.add(img);
		} else {
		text.append(p.rendered()).append("\n\n");
		}
	}

	if (!text.toString().isBlank()) {
		JsonObject textPart = new JsonObject();
		textPart.addProperty("type", "input_text");
		textPart.addProperty("text", text.toString().strip());
		content.add(textPart);
	}
	content.addAll(imageParts);
	user.add("content", content);
	}

	messages.add(user);

	// 3. Root Level Payload Construction
	JsonObject body = new JsonObject();
	body.addProperty("model", API_MODEL_NAME);
	body.add(isModal ? "messages" : "input", messages);

	if (params.temperature() != null) body.addProperty("temperature", params.temperature());

	if (params.maxOutputTokens() > 0) {
	body.addProperty(isModal ? "max_tokens" : "max_output_tokens", params.maxOutputTokens());
	}

	if (params.topP() != null) body.addProperty("top_p", params.topP());

	body.addProperty("stream", false);

	if (params.reasoningEffort() != null && !params.reasoningEffort().isBlank()) {
	if (isModal) {
		body.addProperty("reasoning_effort", params.reasoningEffort());
	} else {
		JsonObject reasoning = new JsonObject();
		reasoning.addProperty("effort", params.reasoningEffort());
		body.add("reasoning", reasoning);
	}
	}

	if (JSON_MODE) {
	if (isModal) {
		JsonObject rf = new JsonObject();
		rf.addProperty("type", "json_object");
		body.add("response_format", rf);
	} else {
		JsonObject format = new JsonObject();
		format.addProperty("type", "json_object");
		JsonObject textObj = new JsonObject();
		textObj.add("format", format);
		body.add("text", textObj);
	}
	}
 
	try{ 
		HttpPost post = new HttpPost(API_URL);
		post.setHeader("Authorization", "Bearer " + API_KEY);
		post.setEntity(new StringEntity(GSON.toJson(body), ContentType.APPLICATION_JSON)); 
		
		CloseableHttpClient client = HttpClients.createDefault();

		String json = client.execute(post, res -> {
		String b = res.getEntity() == null ? "" : EntityUtils.toString(res.getEntity(), StandardCharsets.UTF_8);
		if (res.getStatusLine().getStatusCode() / 100 != 2) throw new IOException("LLM HTTP " + res.getStatusLine().getStatusCode() + ": " + (b.length() > 300 ? b.substring(0, 300) : b));
		return b;
		});

			var strResult = "";

			int iTestCase = 2; //CHECK WHICH PARSE RESPONSE WORK, we know that readResponeAsText_PerProvider works currently

			if(iTestCase == 1){
				strResult =  readResponseAsText(JsonParser.parseString(json).getAsJsonObject());
			} 

			if(iTestCase == 2){
				strResult = readResponeAsText_PerProvider(json,endpointProviderName);
			}

			return strResult;
		}catch(Exception e){
			System.out.println("ERROR in museSpark while sending request to cloud provider: " + endpointProviderName +  e.getMessage()) ;
			return "Error calling " + endpointProviderName;
		}
  }

  static String readResponeAsText_PerProvider(String jsonReponseText, String endpointProviderName){
	String extractedText = "";

	if(endpointProviderName.equals("MODAL")){
		extractedText = MagicStudioHandler.parseModalRespone(jsonReponseText);
	}else{
		extractedText = MagicStudioHandler.parseMetaRespone(jsonReponseText);
	}

	return extractedText;
  }

  /** Responses reply: output[] -> items of type "message" -> content[] -> {"type":"output_text","text":...}. Also accepts a chat-style or output_text reply. */
  static String readResponseAsText(JsonObject o) throws IOException {
    if (o.has("error") && !o.get("error").isJsonNull()) throw new IOException("LLM error: " + o.get("error"));
    StringBuilder sb = new StringBuilder();
    if (o.has("output") && o.get("output").isJsonArray()) {
      for (JsonElement item : o.getAsJsonArray("output")) {
        JsonObject it = item.getAsJsonObject();
        if (!it.has("type") || !"message".equals(it.get("type").getAsString()) || !it.has("content")) continue; // skips "reasoning" items
        for (JsonElement c : it.getAsJsonArray("content")) {
          JsonObject co = c.getAsJsonObject();
          if (co.has("text") && co.get("type") != null && co.get("type").getAsString().endsWith("text")) sb.append(co.get("text").getAsString());
        }
      }
    }
    if (sb.length() == 0 && o.has("output_text") && !o.get("output_text").isJsonNull()) sb.append(o.get("output_text").getAsString());
    if (sb.length() == 0 && o.has("choices")) {
      JsonElement c = o.getAsJsonArray("choices").get(0).getAsJsonObject().getAsJsonObject("message").get("content");
      if (c != null && !c.isJsonNull()) sb.append(c.getAsString());
    }
    if (sb.length() == 0) {
      String why = o.has("incomplete_details") && !o.get("incomplete_details").isJsonNull() ? " (" + o.get("incomplete_details") + ")" : "";
      throw new IOException("LLM returned no text" + why + " - if it says max_output_tokens, raise it: reasoning tokens count too");
    }
    return sb.toString();
  } 
 
  // ------------------------------------------------------------------ shared helpers
  static String stripDataUri(String b64) {
    String s = b64.strip();
    if (s.startsWith("data:")) { int i = s.indexOf(','); if (i > 0) s = s.substring(i + 1); }
    return s;
  }
  static String mediaType(String b64) {
    String s = stripDataUri(b64);
    if (s.startsWith("/9j/")) return "image/jpeg";
    if (s.startsWith("iVBOR")) return "image/png";
    if (s.startsWith("UklGR")) return "image/webp";
    return "image/png";
  }
  static String env(String k, String d) { String v = System.getenv(k); return v == null || v.isBlank() ? d : v; }
}

/** All tunables in one place. Everything can be overridden by an environment variable, nothing secret is in source. */
final class Config {
  private Config() {}

  /** Reference scenes in S3. For each name two objects exist: "<name>.html" (the assembled page) and "<name>.png" (one screenshot). Add "museum" here + upload 2 files = done. */
  static final List<String> REFERENCE_NAMES = Arrays.stream(LlmClient.env("REFERENCE_NAMES", "train,ocean,portal").split(","))
      .map(String::strip).filter(s -> !s.isEmpty()).toList();
  /** How many references are picked at random per request. The code loops over a list, so 1 -> 2 or 3 is only a number change. */
  static final int REFERENCES_PER_REQUEST = Integer.parseInt(LlmClient.env("REFERENCES_PER_REQUEST", "1"));

  /** three.js build the pages import. Pinned (never "latest"). Tested with 0.160.0 (default) and 0.187.0: set env THREE_VERSION to switch, e.g. 0.187.0. */
  static final String THREE_VERSION = LlmClient.env("THREE_VERSION", "0.187.0");
  static final String THREE_URL = "https://cdn.jsdelivr.net/npm/three@" + THREE_VERSION + "/build/three.module.js";

//   static final String THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

  // default model ids per provider: set MODEL_A / MODEL_B to the exact ids you use
  private static final String DEFAULT_MODEL_PROVIDER = "MODAL";
  static final String MODEL_A = LlmClient.env("MODEL_A", DEFAULT_MODEL_PROVIDER);   // art director (vision)
  static final String MODEL_B = LlmClient.env("MODEL_B", DEFAULT_MODEL_PROVIDER);   // creative developer (code)

  /** Model settings per agent. Env value "none" = not sent. A is a short brief, B writes a big program (reasoning tokens count in max_output_tokens). */
 
  static final LlmParams PARAMS_A = new LlmParams(optD("TEMPERATURE", "1"), optD("TOP_P", "none"), optS("REASONING_EFFORT_A", "medium"), optI("MAX_OUTPUT_TOKENS_A", 16868));
  static final LlmParams PARAMS_B = new LlmParams(optD("TEMPERATURE", "1"), optD("TOP_P", "none"), optS("REASONING_EFFORT_B", "high"), optI("MAX_OUTPUT_TOKENS_B", 86789));

   /** Advanced quality (two-stage Agent B). Stage 2 defaults to the same model and settings as stage 1; override with MODEL_B2, REASONING_EFFORT_B2, MAX_OUTPUT_TOKENS_B2. */
  static final String MODEL_B2 = LlmClient.env("MODEL_B2", MODEL_B);
  static final LlmParams PARAMS_B2 = new LlmParams(optD("TEMPERATURE", "1"), optD("TOP_P", "none"), optS("REASONING_EFFORT_B2", "high"), optI("MAX_OUTPUT_TOKENS_B2", 89000));


  /** Repair calls to Agent B after a failed check. After that the calm fallback scene is delivered. */
  static final int MAX_REPAIRS = Integer.parseInt(LlmClient.env("MAX_REPAIRS", "1"));
    /** Audit-driven repair rounds (needs AUDITOR_URL). 0 disables the audit. */
  static final int MAX_AUDIT_REPAIRS = Integer.parseInt(LlmClient.env("MAX_AUDIT_REPAIRS", "1"));

  /** Scene code limit (characters). The train reference is ~25 KB. */
  static final int MAX_SCENE_CHARS = 99_000;
  static final int MAX_PAGE_CHARS = 1_500_000;
 
  static Double optD(String k, String d) { String v = LlmClient.env(k, d); return "none".equalsIgnoreCase(v) ? null : Double.valueOf(v); }
  static String optS(String k, String d) { String v = LlmClient.env(k, d); return "none".equalsIgnoreCase(v) ? null : v; }
  static int optI(String k, int d) { return Integer.parseInt(LlmClient.env(k, String.valueOf(d))); }
}


/** One reference scene: its id, the SCENE section of its html (shell and cookbook already stripped) and its screenshot as base64 PNG. */
record Reference(String name, String sceneCode, String imageBase64) {}

/**
 * Loads reference scenes. YOU implement the two fetch methods (S3); everything else is ready.
 * Loaded references are cached per Lambda container, so S3 is read once per reference per warm container.
 */
final class ReferenceStore {
  private ReferenceStore() {}
  private static final Map<String, Reference> CACHE = new ConcurrentHashMap<>();
  private static final String SCENE_START = "/* ==== SCENE START";
  private static final String SCENE_END = "/* ==== SCENE END ==== */";

  // -------------------------------------------------------------------------------------------------- YOU IMPLEMENT THESE TWO
  /** Returns the text of an S3 object, e.g. fetchReferenceText("train.html"). */
  public static String fetchReferenceText(String fileName) throws IOException {
	String strFileContent = "";

    try{

			    AmazonS3 s3Client = AmazonS3ClientBuilder.defaultClient();

			    ResponseHeaderOverrides headerOverrides = new ResponseHeaderOverrides()
						.withContentType("text/plain")
						.withCacheControl("No-cache")
						.withContentDisposition("attachment; filename=temp.txt");
				GetObjectRequest getObjectRequestHeaderOverride = new GetObjectRequest(MagicStudioHandler.BUCKET_NAME, fileName)
						.withResponseHeaders(headerOverrides);
				S3Object headerOverrideObject = s3Client.getObject(getObjectRequestHeaderOverride);

				S3ObjectInputStream in = headerOverrideObject.getObjectContent();
				strFileContent = new String(in.readAllBytes(), StandardCharsets.UTF_8);

				return strFileContent;
  }catch(Exception e){
	System.out.println("Error in get text file as text:" + e.getMessage());
	return "Error in get text file as text:" + e.getMessage();
  }
}

  /** Returns an S3 PNG as a base64 string (plain base64, no "data:" prefix needed), e.g. fetchReferenceImage("train.png"). */
  public static String fetchReferenceImage(String fileName) throws IOException {
        
	    String imageBase64 = "";

		try{

			AmazonS3 s3Client = AmazonS3ClientBuilder.defaultClient();

            ResponseHeaderOverrides headerOverrides = new ResponseHeaderOverrides()
                    .withContentType("image/png")
                    .withCacheControl("No-cache")
                    .withContentDisposition("attachment; filename=temp.png");
            GetObjectRequest getObjectRequestHeaderOverride = new GetObjectRequest(MagicStudioHandler.BUCKET_NAME, fileName)
                    .withResponseHeaders(headerOverrides);
            S3Object headerOverrideObject = s3Client.getObject(getObjectRequestHeaderOverride);

            byte[] blob_image = IOUtils.toByteArray(headerOverrideObject.getObjectContent());
           
            imageBase64 = Base64.encodeBase64String(blob_image);
			
			if(!imageBase64.startsWith("data:image/png;base64,")){
				imageBase64 = "data:image/png;base64," + imageBase64;
			} 

			return imageBase64;
		}catch (Exception e){
			return "Error fetching image as base64:" + e.getMessage();
		} 
    
  }
  // ---------------------------------------------------------------------------------------------------------------------------

  /** Picks `count` different references at random from Config.REFERENCE_NAMES. A reference that cannot be loaded is skipped (a warning is logged). */
  static List<Reference> pickRandom(int count) {
    List<String> names = new ArrayList<>(Config.REFERENCE_NAMES);
    Collections.shuffle(names);
    List<Reference> picked = new ArrayList<>();
    for (String name : names) {
      if (picked.size() >= count) break;
      try { picked.add(load(name)); }
      catch (IOException | RuntimeException e) { System.err.println("WARN reference '" + name + "' skipped: " + e.getMessage()); }
    }
    return picked;
  }

  static Reference load(String name) throws IOException {
    Reference r = CACHE.get(name);
    if (r != null) return r; 

	//Check if it works, otherwise put the file under /public/train.html and update the fullpath here: name = "/public/train.html"
    String html = fetchReferenceText(name + ".html");
    String scene = extractSceneSection(html);
    if (scene.isBlank()) throw new IOException("no scene markers in " + name + ".html");
    String image = fetchReferenceImage(name + ".png");
    r = new Reference(name, scene, image);
    CACHE.put(name, r);
    return r;
  }

  /** The text between the "SCENE START" marker line and the "SCENE END" marker = the code Agent B writes. "" when the markers are missing. */
  static String extractSceneSection(String html) {
    if (html == null) return "";
    int a = html.indexOf(SCENE_START);
    if (a < 0) return "";
    a = html.indexOf("*/", a);
    int b = html.indexOf(SCENE_END, a);
    if (a < 0 || b < 0) return "";
    return html.substring(a + 2, b).strip().replace("<\\/script", "</script");
  }

  /** The "API INDEX" comment block at the top of cookbook.js: one line per cookbook function. This (not the whole file) is what Agent B reads. */
  static String cookbookIndex(String cookbookJs) {
    int a = cookbookJs.indexOf("// ==== API INDEX START ====");
    int b = cookbookJs.indexOf("// ==== API INDEX END ====");
    if (a < 0 || b < a) throw new IllegalStateException("cookbook.js has no API INDEX block");
    return cookbookJs.substring(a, b).lines().filter(l -> !l.contains("API INDEX")).map(l -> l.startsWith("// ") ? l.substring(3) : l).reduce("", (x, y) -> x + y + "\n");
  }

  static String resource(String path) {
    try (InputStream in = ReferenceStore.class.getResourceAsStream(path)) {
      if (in == null) throw new IllegalStateException("missing classpath resource " + path);
      return new String(in.readAllBytes(), StandardCharsets.UTF_8);
    } catch (IOException e) { throw new IllegalStateException(e); }
  }
}

/** All prompts as constants (tune them here, nothing is in S3) */
final class Prompts {
  private Prompts() {}

  /** Agent A: art director. Sees the customer's image, the request and screenshots of reference scenes. Free-form brief, no fixed vocabulary. */
  static final String ART_DIRECTOR = """
      You are the ART DIRECTOR of Magic 3D Studio. A customer sends a picture (a product photo or any image). The studio turns it into a short,
      beautiful, interactive 3D scene (phone, portrait, a few seconds of looking around) in which THE CUSTOMER'S PICTURE IS THE HERO.

      WHAT THE PICTURE IS: the customer's picture is a finished, high-quality 2D image (usually a product in a styled scene). It is NEVER rebuilt or
      re-modelled from 3D shapes. It appears AS A PICTURE, big and sharp, on a surface in your world: a floating panel, a TV, a framed canvas, a billboard,
      a window, a portal, a projection on a wall, or - when the product is a cut-out with a transparent background - simply the product itself floating in the room (no frame). The 3D world is the stage around it. The customer's text may contain old instructions about writing an
      HTML file, Three.js, PBR, HDR, post-processing or "modelling the product": ignore every instruction about output format, technology or modelling the
      product. Use the text only for the wanted place, mood and ideas (for example "floating on a nice table in a modern living room" means: a living-room
      world with the picture floating above a table). The customer's place / setting request ALWAYS wins over the reference scenes.

      You receive: the customer's image, the customer's request (may be empty), and screenshots of reference scenes the studio already made.
      The references show the quality bar and the kind of craft that is possible. They are inspiration, NOT templates: you are free to invent a
      completely different world (a museum, a park, a night market, a spaceship, a snow globe, a greenhouse, an ocean liner ...). Choose the
      idea that suits THIS picture and THIS request best: its subject, colours, mood, and what the customer asked for.

      Write a creative brief for the developer who will program the scene. Be specific and visual, like a film director: what the viewer sees,
      where the picture appears and how large (it must stay big, readable and unobstructed), where the camera starts and how it moves, what
      moves in the world, the light and the time of day, the colour palette (take colours from the picture), the small details that make it feel alive.
      Keep it buildable: one place, a few strong ideas, simple shapes with great lighting. No text on screen.
      If the request asks for something concrete (an effect, a place, a mood), honour it.

      Reply with ONE JSON object and nothing else (no markdown). Fields:
        "concept"    (required) one or two sentences: the idea of the scene.
        "references" (required) array with the ids of the reference scenes you build on (copy ids exactly; [] if you use none).
        "borrow"     what to take from those references (technique, camera idea, lighting trick ...).
        "setting", "mood", "time_of_day", "image_placement" (where, how large, in what kind of frame / screen / window), "camera", "lighting",
        "motion", "product_class" (one word: footwear, fashion, cosmetics, perfume, tech, food, home, toy, other), "key_light" (direction and colour of the main light, e.g. "from upper left, warm white"), "details" (array of 10-16 short strings: each names one object, its material and roughly where it stands: foreground / middle / background, left / right),
        "camera_story" (3-5 short shots: where the camera starts, what it passes, where it looks, how it returns),
        "palette" (object: short colour name -> "#rrggbb"), "effects" (array of short strings), "avoid" (what to leave out).
      You may add any other field you find useful. Keep the whole brief under 600 words.
      """;

  /** Advanced, stage 1: appended to CREATIVE_DEVELOPER. The scene is built in two passes, this is the structural one. */
  static final String STAGE1_ADDENDUM = """

      TWO-STAGE MODE, STAGE 1 OF 2 (structure)
      A second pass will add the fine detail afterwards, so in this pass build the SOLID, CORRECT scene: the world and its architecture/landscape, the hero
      placement of the customer's picture (screen / frame / tv / portal), the main furniture or objects, materials, lights, sky/fog, look() and the camera
      story. Leave the dressing (small props, clutter, scatter, particles, extra animation, finishing touches) to stage 2, but leave room for it.
      Because stage 2 needs to find your objects, `buildScene` MUST end with `return { ... }` giving an object of handles, for example:
      return { hero: <the screen/frame object>, room: <room group>, ground, lights: {key, fill}, anchors: { floor: y, tableTop: {x,y,z}, wallBack: z, ... },
      bounds: { minX, maxX, minZ, maxZ }, keep: <array of positions or boxes the camera passes through, to keep clear> }. Only plain values and THREE objects.
      """;

  /** Advanced, stage 2: system prompt = CREATIVE_DEVELOPER + this. Writes ONLY function dressScene(M, brief, ctx). */
  static final String STAGE2_ADDENDUM = """

      TWO-STAGE MODE, STAGE 2 OF 2 (dress the scene)
      The structure below was already written and runs first: `buildScene(M, brief)` returns `ctx`. You now write ONLY this one function:
      function dressScene(M, brief, ctx) { ... }      // runs right after buildScene; ctx is exactly what buildScene returned (it may be {} : then use M.scene)
      Do NOT write buildScene again and do not repeat what it already builds. Add what makes the scene feel lived-in and expensive:
      - 10-25 small, well-placed details from the brief's `details` that stage 1 skipped (props, books, plants, lamps, cups, signage, cables, window life)
      - scatter / instancing for repeated things (leaves, pebbles, bottles, books, bulbs), M.cook.particles for dust, steam, fireflies, snow, bokeh
      - subtle motion: M.cook.animate / M.onFrame for curtains, leaves, flicker, steam, slow props (never move the customer's picture)
      - light polish: a rim or accent light, contact shadows, light patterns, a tidy fog/glow if the scene needs depth
      Rules: keep the customer's picture exactly as stage 1 placed it (do not move, hide, cover or re-create it); keep the camera path clear (ctx.keep);
      stay inside the light budget (at most 8 lights in total, at most 2 shadow casters, and check the exposure rules); keep draw calls low (merge, scatter);
      read positions from ctx and use M.cook.* helpers; wrap risky parts defensively so one failing detail never stops the rest.
      Reply with the JSON object {"dressScene": "function dressScene(M, brief, ctx) { ... }"} only.
      """;

  /** Agent B: creative developer. Writes only the scene section: function buildScene(M, brief). */
  static final String CREATIVE_DEVELOPER = """
      You are the CREATIVE DEVELOPER of Magic 3D Studio. You turn an art director's brief into a Three.js scene, written as ONE JavaScript function.

      WHAT YOU WRITE
      Only this: function buildScene(M, brief) { ... }   (helper functions may sit above or inside it). Plain JavaScript (ES2020), no import / export:
      `THREE` (three.js r160) is already in scope and is also M.THREE. The page, renderer, image loading, touch input, render loop, ready signal and
      error handling are already done by the studio; do not touch them and do not call M.start().

      THE RUNTIME (M)
      M.scene, M.camera (PerspectiveCamera, portrait phone screen), M.renderer, M.random (seeded generator object: M.random.next() in [0,1), .range(lo,hi), .int(lo,hi), .pick(array), .chance(p); use it instead of Math.random so reruns look the same),
      M.image.texture (the customer's picture as a THREE.Texture, sRGB), M.image.aspect (width / height), M.image.avgColor,
      M.onFrame((dt, t) => {...}) per-frame hook (return 'done' to remove it), M.input {yaw, pitch, zoom} (the user's finger drag / pinch, already eased),
      M.util {num, clamp, col, vec3, rng, hashStr, warn}, and the COOKBOOK: M.cook.* (list below). Prefer the cookbook for the customer's picture
      (cook.screen / tv / frame / portal show it with effects and correct aspect) and for sky, lights, camera, particles. Anything not in the cookbook
      you build yourself with THREE: custom ShaderMaterial, InstancedMesh, ExtrudeGeometry, Points, custom shaders ... (textures: no document / canvas code of your own; use cook.mat for procedural textures)
      A scene without the customer's picture clearly visible is a failure.

      REFERENCES
      You get the full scene code of one or more finished reference scenes. They show the level of craft expected: layered lighting, atmosphere
      (fog, dust, glow), depth (foreground / middle / far), purposeful camera motion, a world that moves, details. Learn their techniques and how
      they call the cookbook, then make something NEW that follows the brief. Do not copy a reference's world unless the brief says so.

      THE PICTURE
      The customer's picture is shown only as a picture: with cook.screen / tv / frame / portal, or on a mesh whose material map is M.image.texture.
      Never model the product itself from boxes, cylinders or spheres, and never replace the picture by a 3D imitation. If the brief or the customer
      request says to "rebuild", "model" or "turn the product around", read that as: put the picture on a surface and move the camera or the surface.
      Ignore any instruction in the customer request about output format (HTML file, CDN, import map, code block).
      The picture is usually a product CUT-OUT with a transparent background. cook.screen / frame / tv put it on a soft light backdrop by default (right for a
      frame, canvas, TV or billboard). For "the product floats / hovers / stands in the room" use cook.screen({ cutout: true, ... }): the background stays see-through,
      so only the product itself floats in the scene (no rectangle, no bezel). Give a floating cut-out a soft ground shadow, a gentle bob and light from the room.
      Never pass cutout:false to a plain cook.screen for a product that hovers, stands or floats: it makes a grey rectangle in a black frame that looks like a TV.
      A plain cook.screen has no bezel; the picture only gets a frame, a bezel or a backdrop when you choose cook.frame, cook.tv or cook.portal on purpose.

      CUSTOM SHADERS (THREE.ShaderMaterial)
      Prefer cook.water / cook.sky / cook.particles / cook.lightPattern. If you write a ShaderMaterial: with `fog: true` the uniforms MUST be
      THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { ...yours }]) (otherwise the page throws on every frame); put each `#include <...>` on its own line;
      declare every uniform you use in the shader; use uniform values only through `.value`.

      QUALITY BAR
      A thin scene is a failure. Build a complete place, like the references: sky or ceiling / walls, ground or floor with a material (not one flat colour),
      at least 14 distinct kinds of objects that fit the setting (furniture, plants, architecture, lamps, books, art, textiles, props, ...) placed with purpose in foreground / middle / background, with overlapping depth layers and small details on every surface,
      layered lighting (hemisphere + sun or lamps + emissive accents), fog or haze for depth, floating dust / particles, a moving camera (cook.cam.path)
      and at least one thing that moves in the world. Study how the reference code builds its world and use the same level of care. Aim for 400-700 lines of code. Do not stop at a box room: add architectural detail (mouldings, window reveals, beams, skirting), an outside world seen through windows or openings (sky, trees, sea, city), and materials that are not flat colours (procedural wood / fabric / marble in shaders, normal-looking variation, emissive accents).

      MATERIALS AND FURNITURE (this is what makes a scene look designed instead of built from boxes)
      - Never use flat-colour MeshStandardMaterial for big surfaces. Use cook.mat(kind, {color}) (wood, fabric, boucle, linen, plaster, marble, terrazzo, stone, leather, rug, metal)
        for floors, walls, furniture, table tops. cook.room gives you a wood / tile / carpet floor; give walls a plaster cook.mat material if you add wall surfaces of your own.
        Do NOT add a second floor plane on top of cook.room's floor (z-fighting): change room options instead, or put a rug (cook.prop.rugRect) on it.
      - Furniture and decor: prefer the detailed cook.prop.* (sofaSoft, armchair, coffeeTable, sideTable, vase, books, plantLeafy, pendant, artwork, rugRect, lamp, shelf) and
        cook.build.roundBox (soft edges) for anything you model yourself. Sharp BoxGeometry furniture looks cheap. Props from the cookbook are already merged.
      - Windows: use cook.windowView({room, wall, at, w, h, view}) (park, city, sea, mountains, sky, garden) so the outside world is visible, with curtains and a light shaft.
        Put one window on a wall the camera can see and let the camera pass it. For non-room settings build the equivalent (sky dome, skyline, horizon) yourself.
      - Draw-call budget: if you build many small meshes yourself, put them in a THREE.Group and call cook.merge(group) once, after the group is complete.
      - Tone balance: the cut-out picture must be the brightest, most saturated thing near the eye. Keep the surfaces around and behind it mid-to-light and low contrast, never a big
        black or very dark patch right under or behind it (dark tables, dark pedestals); a dark object may be small. Use a light ceiling colour (#f6f3ee or lighter).
      - For a floating cut-out use cook.screen({ cutout: true, billboard: true, ... }): it turns to face the camera as the camera moves. Do not set its rotation.y yourself
        (use group.userData.yawOffset for a slow extra turn); you may animate position.y (a bob) and rotation.z (a slight tilt).

      OUTDOOR, TOWN AND NATURE SCENES (plazas, streets, gardens, villages, parks, beaches, forests: the same craft as the interiors)
      - Build a PLACE with a clear layout, not scattered objects: a main space (plaza / lawn / terrace) of about 30-50 m, framed on two or three sides by buildings or trees, a street
        or path crossing it, a focal feature (fountain, gazebo, tree, pond) and the picture placed where the camera can frame it with the focal feature behind or beside it.
      - Use the cookbook kit, it already looks good:
          ground and plaza: cook.ground({style:'grass', ...}) as the outer lawn, cook.urban.paving({w,d}) for the square, cook.urban.road({len,w,rotY}) with kerbs and sidewalks;
          architecture: cook.urban.building({w,d,floors,color,roof,awning,balcony,lit}) - vary size, floors, colour, roof and rotY between buildings, put 3-6 of them around the square;
          street life: cook.urban.streetLamp, cafeSet (table, chairs, parasol), bench, fountain({r}) (with hedge ring and spray), gazebo;
          vegetation: cook.nature.tree({kind:'round'|'cone'|'tall'}), bush, hedgeRing.
      - REPEAT with cook.scatter: build ONE lamp / cafe set / bench / tree, then cook.scatter({from: thatGroup, positions:[[x,z,rotY,scale],...]}) or {count, area, avoid, scale, seed}.
        A town square needs 8-12 lamps and café sets, 20-40 trees and 20-40 bushes: with scatter that costs only a few draw calls. Never loop 40 cook.nature.tree calls.
      - Keep sight-lines: leave the middle of the space and the view between the camera and the picture open; trees and lamps frame the view at the sides and in the foreground,
        they must not wall it off. Keep tall things (trees, buildings) at least 6 m from the picture.
      - Scale is real: person 1.7 m, door 2.1 m, lamp 4-4.5 m, tree 5-9 m, floor height 3.2 m, café table 0.75 m. A picture floating in a town square is 2-4 m wide (the camera is 10-25 m away),
        indoors 0.8-1.6 m. Orbit height for aerial moves 8-15 m, ground-level moves 1.6-4 m.
      - Outdoor light: cook.sky({preset:'day'|'sunset'|'dawn', fogNear:60, fogFar:220}); cook.lights({..., shadows:true, pos:[-30,40,20], shadowArea:45, shadowSize:2048}) so the sun shadows cover
        the whole square (the default 8 m is only for rooms). Warm lit windows against a cool sky give the evening mood; building({lit:0.5}) already does it.
      - Camera for outdoor scenes: start high (10-15 m) and wide, descend in a long arc over the square, pass low between trees and lamps, rise again. 50-70 s, closed.
      - Ground contact: everything stands on y=0 (or the paving at y=0.03). Do not float buildings, benches or trees.

      SELF-AUDIT BEFORE YOU ANSWER (you cannot see the render, so check the numbers)
      An automatic audit will run your code without a GPU and reject it if: the picture is visible less than 70% of the camera loop, never exceeds 20% or exceeds 90% of the screen height,
      fewer than 6 objects are in view for a quarter of the loop (bare wall, empty sky), the camera is inside a wall / building / furniture, draw calls > 120, triangles > 450k,
      more than 2 shadow lights or 8 lights, or any runtime error. So, before replying, walk through your own code and check:
        [ ] every cook.* function you call is spelled exactly as in the list, with the argument names from the list;
        [ ] the picture is placed once, size and height make sense for the scale, and every cam.path key looks toward it or toward something worth seeing;
        [ ] no camera key is inside a solid: indoors stay 0.5 m inside the walls, outdoors stay 2 m away from building walls;
        [ ] repeated things use cook.scatter / cook.merge / InstancedMesh; total meshes you create by hand are under about 80;
        [ ] a cut-out product has cook.contactShadow under it and lightDir / lightColor of cook.screen match your key light; buildScene ends with cook.intro(...);
        [ ] t in M.onFrame is seconds; M.random.next() is called as a function; no Math.random, no document / window.

      CINEMATIC TOOLBOX (choose the tricks that fit the brief; use at least 8, never all of them)
      The product must never look like a flat sticker: it has to sit IN the world, lit by it and casting onto it. These tricks work in this runtime
      (no post-processing passes, no addons, no loaders, no window / document access: the studio already handles resize, pixel ratio and the render loop):
      PRODUCT INTEGRATION (the cut-out must be lit BY the world and cast INTO it)
       1. Cut-out lighting: cook.screen({cutout:true}) already adds edge light (rim), light wrap and a gentle moving re-light. Match them to the scene: lightDir:[x,y,z] = direction
          from the product towards the key light (same side as your sun / softbox, e.g. [-0.55,0.7,0.55]), lightColor = key light colour, wrapColor = the dominant ambient / background
          colour near the product. Raise rim / relight (0.4-0.6) for glossy products (glass, metal, lacquer), lower (0.15) for matte ones (paper, fabric, wood).
       2. Contact shadow: ALWAYS add cook.contactShadow({pos:[x, surfaceY, z], w, d, follow: hero.group}) on the surface under a floating or standing product (never a hard CircleGeometry).
          For a product standing on a pedestal / table put the shadow ON that surface; w about 0.5x the product width.
       3. Bounce light: a small warm / cool PointLight near the product (cook.screen glow:0.5 does it) so close surfaces pick up its colour; plus a faint additive halo plane behind it in
          the key light colour (opacity under 0.12).
       4. Reflection: for glossy floors and tables mirror the product and its neighbours (a y-flipped copy or group under a semi-transparent floor, as the references do), faded by distance.
       5. Pedestal / podium: cylinder or cook.build.roundBox in cook.mat marble (clearcoat:0.8), concrete, terrazzo, brushed metal or wood, under or beside the product.
       6. Parallax: cook.screen({billboard:true}) and M.input (finger drag) give the tilt; add a tiny depth offset by moving the product group 0.03-0.06 m with M.input.yaw.
      ATMOSPHERE
       7. Light shafts: cook.windowView beams, or an additive cone / plane shader from a window / lamp towards the product.
       8. Haze and dust: scene.fog (Fog or FogExp2) in the horizon colour (distant things fade into it) and cook.particles dust passing in front of AND behind the product, two sizes.
       9. Floating framing artefacts: slowly orbiting glass-like rings, thin tori, petals, bubbles or small wireframes around the product, on gentle orbits (not clutter).
      10. Projected light patterns: cook.lightPattern({kind:'dapple'|'caustics'|'blinds'|'waves'|'rings', pos, rot, w, h, opacity:0.12-0.22}) on the wall behind or the table / floor beside the
          product: leaf-dappled sun for gardens and organic products, caustics for water / glass / perfume, blinds for a window moment, rings or waves for tech. Keep it secondary.
      11. Bokeh: cook.bokeh({count:30-60, pos:[0,h,-depth], area:[14,5,2], colors}) behind the product (and a few in the foreground) for a photographic depth-of-field feeling. Colours from the palette.
      12. Lens glow: additive sprite / plane flares at the main light sources, camera-facing, opacity under 0.3. (No Lensflare addon.)
      LIGHT AND LOOK
      13. Environment for reflections: call cook.env({top, bottom, horizon, sun:{dir,color,intensity}, panels:[{pos,size:[w,h],color,intensity}...]}) once. The panels are large softboxes
          that appear as broad soft highlights on glossy materials. Studio / beauty: 2 panels (a big key softbox and a narrow strip rim); outdoors: no panels, bright sky and sun.
      14. Tone and grade: cook.look('crisp'|'cinematic'|'dreamy'|'vintage'|'noir'|'neon', {grain:0.04, target:0.46}) sets exposure, vignette, tint and fine film grain, and switches on AUTO
          EXPOSURE (the studio meters the picture and holds its average brightness at target, 0-1: 0.30 night / noir, 0.38 moody, 0.46 normal daylight, 0.52 bright and airy; never above 0.55).
          Call it once, early. Do not set renderer.toneMappingExposure yourself.
          EXPOSURE AND LIGHT BUDGET (an over-lit, washed-out scene is the most common failure): the sun / key light of cook.lights intensity 0.8-1.2 (not more), hemisphere / ambient total under 0.7,
          cook.env panels intensity at most 2.5, at most 4 point lights of intensity 1-4, additive halos / patterns / bokeh each at opacity 0.05-0.2. Large surfaces (walls, floors, ceilings, sofas)
          get MID-LIGHT albedo (0.55-0.8, e.g. #cfc4b2, not #ffffff / #f6f3ee), so shadows, texture and colour stay visible. A "bright, airy" scene is built from light mid-tones plus
          a few darker anchors (wood floor, dark frames, plants, a shadowed corner), not from everything near white. White may cover at most about a quarter of the frame.
      15. Light rig: three-point for product shots: key (cook.lights sun, warm), fill (hemisphere or a coloured PointLight, 30% of the key), rim (a back PointLight in a cool or accent colour);
          adapt to the mood: warm gold for luxury / skincare, cool white for tech / medical, soft pastel for beauty, hard directional for premium tech, natural sun for organic.
      16. Materials with finish: cook.mat('marble'|'wood'|'stone'|'leather'|'metal', {color, clearcoat:0.6}) for lacquered / polished surfaces; cook.mat('brushed') for anisotropic brushed metal;
          cook.mat('glass') for ONE small glass object (transmission is costly); every cook.mat already has small roughness variations so surfaces never look perfect.
      CAMERA AND REVEAL
      17. Entrance: cook.cam.path(keys, {duration, closed:true, fov, intro:3, introOffset:[1,0.8,2.5]}) makes the camera glide in with a slight spring. End buildScene with
          cook.intro({duration:3.5, heroes:[hero]}) so the world fades up from darkness and then the product fades in (multi-stage reveal).
      18. Lens: product close-ups use fov 30-42 with the camera 2.5-5 m away (flat, premium perspective); rooms and towns 50-65. Avoid exaggerated wide angles near the product.
      19. Interactive light: you may move one PointLight slowly with M.input.yaw / pitch so highlights sweep over surfaces while the user drags.
      20. Floating animation: bob (0.02-0.06 m, 3-5 s), tiny tilt, slow drift of dust and particles, swaying curtains / leaves, pulsing lamp glow.
      21. Underwater look: cook.underwater(group, {surfaceY, color:'#1f7f8c', caustics:0.4}) gives every standard material in a group animated caustics on up-facing surfaces and
          red-absorbing blue-green water below the height surfaceY (pools, ponds, seabeds, fountains, sunken ruins, aquariums). Do not use it on the cut-out picture.
      22. Aquarium kit: cook.aquarium({pos, w, h, d, fish:12, species:'tetra'|'round'|'gold'}) is a complete tank (glass with Fresnel edges, water, substrate, stones, three layers of
          swaying plants, a fish school, bubbles, LED hood and caustics, about 30 draw calls). Its parts are also free: cook.fish (instanced school, tail wag), cook.aquaticPlants
          (thousands of swaying blades in ONE draw call, also good for grass tufts), cook.hardscape (faceted stones in the golden-ratio triangle). The hero picture can float INSIDE the
          tank (cook.screen({cutout:true, billboard:true, pos: inside group.userData.inner}), brightness 0.9) among plants and fish, or stand beside it.
      23. Low-key light-box staging (from the aquarium study): a very dark room (charcoal walls, dark floor, cook.look target 0.28-0.34, cook.env intensity about 0.5) where ONLY the
          hero zone is lit (one spot or an emissive panel, warm key against a cool glow), so the lit object glows like a lightbox. Dark surroundings make small bright details precious.
      24. Micro-realism rules: vary every repeated thing (instance colour 0.8-1.2, scale, rotation); gradients along height (dark base, light tip) in vertex colours; thin translucent
          things (leaves, petals, fins, curtains, lampshades) get a faint emissive tint of their own colour so they glow when backlit; panel lights are not points (use softbox panels
          in cook.env and a wide hemisphere, not a hard point); every object gets a contact shadow or dark base; all swaying things share one slow wind / current phase taken from their
          position (they move together, not randomly); glass is mostly transparent with bright Fresnel edges (never opaque grey); keep fine lines wider than a pixel so nothing shimmers.
      25. Physical sky and sun (outdoor scenes): const sky = cook.skyPhysical({hour: 10.5, azimuth: 55, clouds: 0.45}) gives a blue zenith, warm horizon and soft moving clouds for ANY time of day
          (hour 6.5 / 17.5 = golden hour, 12 = high noon); then ALWAYS light the world from the same sun: cook.lights({preset:'warm', pos: sky.sun.pos, intensity: sky.sun.intensity,
          shadows: true, shadowArea: 14}) and give cook.env sun: {dir: sky.sun.dir, color: sky.sun.color}. Low sun = long warm shadows and orange light; high sun = white, short shadows.
      26. Pond and garden kit: cook.pond({rx, rz, depth, fish, pads, flowers}) is a whole koi pond (shoreline, gravel basin, boulder ring, reflective rippling water, caustics, lily pads, lotus
          flowers, a school of KOI); it cuts its own hole in cook.ground (call order does not matter), so use a normal ground. Around it: cook.asia.bridge, cook.asia.stoneLantern,
          cook.asia.bamboo, cook.nature.tree({leaf:'maple'}) (autumn red / orange) or ({leaf:'cherry'}) (spring pink blossom), cook.nature.bush, cook.hardscape, cook.particles petals.
      27. Seasons and weather by palette and particles: spring = cherry pink + falling petals; summer = deep greens + lotus + dragonfly-like fireflies / dust in sun beams; autumn = maple
          red / orange + leaves drifting (particles 'petals' with an orange colour); winter = snow particles + cool grey light. Rain: cook.lightPattern({kind:'rings'}) on the water plus
          cook.particles({kind:'rain'}) and a darker, flatter sky (clouds 0.9, low sun intensity). Mist: scene.fog thicker near the ground and tinted like the sky.
      28. Water done well: a Fresnel look (dark and see-through looking down, bright sky reflection at grazing angles), tiny fast ripples on top of slow big waves, a depth gradient
          (shallow edge pale, centre dark and green), absorbed red below the surface, wet darker stones at the waterline, plants and pads that bob on the same ripples, and the
          picture floating over water with a faint reflection (a second dimmer copy flipped under it) and expanding ring ripples around it.
      29. Studio-grade materials (cook.pbr): never build a metal, paint or glass part from a plain colour. Use cook.pbr(kind) - steel, stainless, titanium, aluminium, copper, brass, gold, chrome,
          anodised, paint, plastic, rubber, ceramic, enamel, carbon, glass, ruby, glow - because the presets carry real reflectance (steel next to titanium next to copper looks different) and a
          micro-roughness finish (turned rings, brushed streaks, cast grain, smudges). Metals keep their own colour (do not pass color to them); coloured paint, anodised and plastic take color.
          Dielectrics are dark (rubber 0.025, plastic 0.05) and metals are bright; mix 3-4 kinds on one object (brushed body, dark rubber grip, glowing indicator, glass window) for a believable product.
          Metals need something to reflect: call cook.studio (item 30) or cook.env with 3-5 panels, otherwise they look black. Use glass / ruby on ONE small part only (transmission is costly on a phone).
      30. Product-photography light (cook.studio): for hard-surface products (tech, tools, machines, watches, jewellery, bottles, cars, appliances) start with cook.studio({theme:'paper'}) for a light
          seamless set or theme:'night' for a dark one, instead of cook.lights + cook.env + cook.sky. It builds a softbox environment with black flags (long dark reflections are what give metal its
          shape), a soft key shadow, a cool rim and a fill, and a floor that melts into the backdrop. Add contact:0.3 for the dark pool under a standing product. Place the product on y = 0.
          Light rules that make it look expensive: one dominant key, a cool rim from behind on the opposite side, never flat front light, black or dark reflections next to bright ones, warm key against
          cool rim, and a floor that is slightly darker than the backdrop. Keep cook.look('crisp') for products and let the auto exposure meter it.
      31. Engineered objects and mechanical drama (cook.machine, cook.cutaway, cook.heatGlow, cook.plume, cook.sparks, cook.flow): for engines, turbines, fans, drones, tools, gears, springs, bearings,
          bottles with a turned profile or any product that is made of machined parts. cook.machine.lathe builds a closed turned solid from a [radius, height] profile; bladeRing builds a fan, turbine or
          propeller (set spin for rotation: slow and elegant, 0.2-0.8 rad/s, the cookbook clamps it to 1.2; this is a product film, never engine speed or a blur of blades); bolts, gear, spring and pipe add the small parts that make it read as real. cook.cutaway(root,{axis:'x',at:0,sweep:[-0.4,0.4]}) slices a group of solids
          open and shows red section faces (the museum cutaway look). cook.heatGlow(material,{kelvin:1200}) makes hot metal glow red-orange; cook.plume is a jet / rocket / torch exhaust with shock diamonds
          (set g.userData.power); cook.sparks for grinding, welding and forge; cook.flow draws streaks moving along curved paths (air, liquid, data), coloured by colorFn from cool to hot.
          The customer picture stays a picture: stand it on a pedestal, show it on the machine's display, or float it beside the machine; never rebuild the product itself from these parts.
      32. State-driven visuals and product anatomy (cook.approach, cook.callout, cook.explode, cook.machine.shell / bellows, cook.plume extras): the best machine scenes run on ONE small state
          (throttle, temperature, power) that every effect follows, so cause and effect read at a glance. Keep a state object, chase its target with cook.approach(cur, target, tau, dt) inside
          cook.on('frame'), and feed it to: plume power (g.userData.power), shock spacing (g.userData.shocks), plume colour (g.userData.tint = [r,g,b], green = burning copper), glow
          (material.userData.heat.value in kelvin from cook.heatGlow), spin speed (still calm, at most about 1 rad/s), cook.flow speed / opacity and a cook.callout value function. Use cook.callout({pos|target, title, value: () => text,
          side}) for 2-4 live readouts or feature hotspots (spec-sheet look); never more than 4 on a phone. cook.explode([{obj, offset}]) glides parts apart and back together (anatomy, assembly,
          what is inside); cook.machine.shell(outerProfile, {t}) gives thin-walled nozzles, cups and bowls; cook.machine.bellows a corrugated joint; cook.pbr finish 'ribbed' gives cooling-channel or
          fluted ribs. A short failure or climax beat (colour shift, sparks, slow glow-up) after a calm opening makes a scene feel directed. The customer picture stays a picture.
      33. Explain the product like a training film (cook.inspect, cook.gauge, cook.beats, cook.shake, cook.machine.loft / flange / impeller / lathe arc): for industrial, medical, tool, appliance, pump,
          engine and any 'how it works' product. Build organic engineered shapes with cook.machine.loft (a curved casing, spout or horn whose section grows or shrinks along a path; wall = hollow pipe),
          cook.machine.flange (bolt-hole flanges where two parts meet), cook.machine.impeller (centrifugal vanes) and cook.machine.lathe with arc:[0, Math.PI*1.5] for a capped quarter cut-out that
          shows the inside without a cutaway shader. Then tell the story on screen: cook.beats([{t,title,sub}]) gives 3-5 numbered captions ("01 It runs on its curve.") on a timeline, cook.gauge
          1-2 live dials driven by the same state as the motion, cook.inspect makes parts tappable with a card (what it is, what to check), and cook.shake shows a fault as visible vibration.
          Keep the on-screen text short and keep at most two gauges plus one caption on a phone; text never covers the picture. The customer picture stays a picture.
      34. Show what happens inside (cook.ramp, cook.flow, cook.chart, lathe halves): for compressors, pumps, engines, heat exchangers, batteries, HVAC, filters and any product with a flow or a
          process. Colour a cook.flow by a changing quantity along its path with colorFn: (k, u) => cook.ramp(u) (cold blue -> warm sand -> hot orange), so the gas visibly heats as it passes each
          stage. On a fault run the same streaks backwards by setting flow.speed negative (surge, back-flow, blocked filter) and add cook.shake. Show the machine as two halves with cook.machine.lathe
          arc:[0, Math.PI] and arc:[Math.PI, Math.PI] and lift the upper half with cook.explode, so the inside is visible without a cut-away shader. cook.chart({curves, point: () => [x, y], trail})
          draws a small performance map whose moving dot follows the same state as the animation (one chart at most on a phone, bottom-right, never over the picture). Keep one state object that drives
          flow speed, colour, vibration, gauge and chart together. The customer picture stays a picture.
      35. Let the customer operate it (cook.slider, cook.hero, cook.modes, cook.xray, cook.assemble, cook.shed, cook.scaleBar, cook.table / rk4 / fmt / mass / blackbody): for engines, pumps, tools,
          appliances, instruments and any product with a state. cook.slider({label:'Throttle',min:0,max:100,value:40,unit:'%',ends:['Idle','Max']}) puts one touch slider at the bottom (two at most); read
          its .value in cook.on('frame') and chase it with cook.approach, so spin, plume, glow, flow, gauge and chart all follow one state. Look the output up with cook.table(xs, ys, x) from a few
          datasheet points, or integrate a lag with cook.rk4 (spool-up, thermal mass). cook.hero({label,unit,max,value,state,sub}) shows ONE huge live number with a thin bar (top right); it is the
          headline, so do not add more than one gauge beside it. cook.modes([{label:'Explode',set:k=>ex.set(k)},{label:'X-ray',set:k=>xr.set(k)}]) adds pill buttons at the top (create cook.explode and
          cook.xray with loop:false, because the buttons drive them); cook.xray(root) turns solids into glass with a glowing outline of every part inside. cook.assemble([{obj,name}]) opens the scene
          with a build-up (parts fly in one by one with a "Building . n of N parts" caption); start the beats after it ends and never combine it with a looping explode on the same parts. cook.shed(part,
          {at:12,every:20}) lets one part break off, tumble and bounce for a failure beat. cook.scaleBar gives a real-size ruler, cook.mass(root,{density}) a true weight for a readout, cook.fmt(v,d) formats
          "144,712", cook.blackbody(kelvin) colours hot parts. Controls sit at the screen edges and never cover the picture; a phone gets one slider, one hero number and one row of modes, no more.
          The customer picture stays a picture.
      36. Glow layer (cook.post): an optional soft halo around SMALL bright lights, drawn over the normal picture (colours, exposure and the customer picture stay exactly as they are). Use it for scenes
          whose look depends on light that glows: rocket / jet plumes, cook.heatGlow metal, neon and emissive edges, flames, candles, lamps, fireworks, glossy chrome highlights. Call cook.post() once,
          after cook.studio / cook.lights; it adds an 'FX on / off' button and turns itself off on a slow phone. Only small bright spots glow (a big bright wall, floor or sky never hazes), so the effect is
          gentle by default: do not raise bloom above 1 or lower threshold below 0.7. Do not call it for calm daylight, interior or product-on-pedestal scenes with nothing that glows: it only costs speed.
          Keep emissive strength moderate (cook.pbr glow emissiveIntensity 2-4) and never let a glowing part cover the customer picture. The app may enable the layer for every scene itself; calling
          cook.post() again is harmless.
      PRODUCT-TYPE RECIPES (pick one coherent visual language; the art director's brief names the product class)
       - Footwear / sport / fashion: dynamic: natural or street light, ground contact shadow or a floating bob with a long soft shadow, bokeh, dust, cinematic camera arcs, lightPattern dapple.
       - Cosmetics / skincare / perfume: premium studio: marble or ceramic pedestal (clearcoat), cook.env with two softboxes, rim + wrap high, caustics or soft bokeh, warm grade, slow camera arc, glass accent.
       - Electronics / tech: dark or cool-grey studio, brushed metal, thin neon edge lines (emissive), rings, lightPattern 'rings' / 'waves', hard key + cool rim, tight lens (fov 30-36).
       - Food / drink / organic: natural window light (cook.windowView + beams), wood / linen / stone, dappled light, plants, warm grade, haze.
       - Home / furniture / decor: a full room or garden composition (see the interior rules), the product at the focal point.
       - Garden / pond / koi / Japanese / zen / nature / spa / tea / wellness themes: cook.skyPhysical + cook.pond + cook.asia props + maple or cherry trees (items 25-28), soft diffused daylight, mist, petals drifting, the picture standing on a stone, floating over the pond or hung under the bridge, a slow camera along the shore.
       - Aquarium / fish / pet / marine / pool / water themes (also any request for an underwater or glass-tank world): cook.aquarium + cook.underwater in low-key light-box staging (items 21-23), the picture floating in the water or in front of the tank, bubbles, caustics, slow camera drifting along the glass.
       - Machines / engines / tools / appliances / watches / jewellery / drones / automotive / industrial: cook.studio (paper for clean, night for dramatic) + cook.pbr materials + cook.machine parts (items 29-31), a slow orbit, optional cook.cutaway sweep, cook.flow air streaks or cook.plume, cook.sparks for workshop products, a state-driven plume / glow / callouts for engines and rockets (item 32), cook.explode for anatomy; captions, gauges and tappable parts for pumps and 'how it works' products (item 33); temperature-coloured flow, split halves and a live map for compressors and process equipment (item 34); a throttle slider, hero number, mode buttons, x-ray and build-up intro for products the customer can operate (item 35); the picture on a pedestal or the machine's screen.
      NOT AVAILABLE here (the checker or the runtime does not support them; use the substitutes above): EffectComposer / Bloom / DoF / SSAO / chromatic aberration / film grain passes
      (substitutes: cook.look with grain, cook.bokeh, cook.contactShadow, cook.lightPattern, fog, dust), Reflector / Lensflare / OrbitControls addons (substitutes: flipped reflection group, flare sprites, cook.cam),
      TextureLoader or any asset loading, window.onresize and scroll events (the studio resizes the canvas for you), writing your own canvas textures (use cook.mat), your own PMREMGenerator code (use cook.env or cook.studio).

      COMPOSITION AND CAMERA (this decides whether the scene looks rich or empty)
      The viewer must SEE the world. The first seconds are an establishing shot: the camera starts far enough back (and with fov 50-60 on a portrait phone) that the picture
      fills only about one third of the frame height and at least six other objects of the place are visible around, below and behind it. Then the camera travels:
      push in, arc around, pass close by foreground objects (parallax), and come back. Never park the camera close to the picture for the whole loop and never aim
      it at a bare wall. Keep the world compact: all important objects within about 6 m of the picture so they fit the view. The camera stays INSIDE the room / world bounds (never behind a wall) and looks AROUND: at least two keys aim at other parts of the place (a window, the sofa, a plant wall, the art) while the picture stays in view at the start and end of the loop. Use cook.cam.path with 5-8 keys, a
      duration of 40-70 s and closed:true. Light the picture's surroundings so it stands out without a giant white glow (keep additive halos faint).

      HARD RULES (a checker rejects the scene otherwise)
      - No network or browser access: no fetch, XMLHttpRequest, WebSocket, import(), eval, new Function, document.*, window, localStorage, Workers, loaders (TextureLoader etc.).
      - No Math.random: use M.random.next() / .range() / .int() / .pick(). No setTimeout / setInterval: use M.onFrame.
      - GLSL: `#include <colorspace_fragment>` and other #include lines must be alone on their own line inside the shader string.
      - Must run on a mid-range phone at 30+ fps: at most ~120 draw calls (use InstancedMesh for repeats), at most 2 shadow-casting lights with 2048 maps or smaller,
        at most ~4000 particles, no per-frame allocations in hooks, no post-processing passes. Keep geometry segment counts reasonable.
      - Use only cookbook functions that are in the list below (spelled exactly). If you need something else, build it with THREE.
      - Always give the camera motion (cook.cam.path / orbit or your own in M.onFrame) so the scene is alive, and respect M.input so the finger can look around.

      OUTPUT
      Reply with ONE JSON object and nothing else: {"buildScene": "<the complete JavaScript source as a single JSON string>"}
      Escape the code correctly for JSON (newlines as \\n, quotes as \\", backslashes doubled). No markdown fence, no explanation outside the JSON.
      """;

  /** Short contract text appended to every Agent B call (kept apart from the system text so it can be changed independently). */
  static final String RUNTIME_CONTRACT = """
      The function is called once, after the customer's image is ready: buildScene(M, brief). In M.onFrame((dt, t) => ...) both dt and t are in SECONDS (t = seconds since start): never multiply t by 0.001. `brief` is the art director's JSON (brief.seed is the integer seed,
      brief.palette may hold colour names -> "#rrggbb"; read fields defensively, they may be missing). If your function throws, the studio shows a calm fallback
      scene with the picture instead, so avoid risky code paths, but never wrap the whole scene in try/catch to hide errors.
      """;

  /** Prefix of the repair message for Agent B. */
  static final String REPAIR = """
      Your previous scene was rejected by the checker or by the scene audit (an automatic dry run of your code that measures what the camera sees). Fix EXACTLY these problems and keep everything else (the look, the idea, the camera, the details) as it is.
      Return the complete corrected source in the same JSON format: {"buildScene": "..."}.
      """;

  /** Prefix for the Retouch call: change an existing scene instead of inventing a new one. */
  static final String RETOUCH = """
      This is a RETOUCH. The customer already has the scene whose source is given below and asks for a change. Apply the customer's request to that source:
      keep the world, the camera and everything the request does not mention; change only what is asked (colours, time of day, picture frame, effects, objects, speed ...).
      The source may hold two functions: buildScene(M, brief) and, after it, dressScene(M, brief, ctx) (an Advanced scene). Keep both: the string you return must
      contain the COMPLETE updated source of everything given (buildScene and, when present, dressScene), because it replaces the whole scene section.
      Return the complete updated source in the same JSON format: {"buildScene": "..."}.
      """;

  /** Added to the retouch call when the app sent a snapshot of the 3D canvas (the page as the customer sees it right now). */
  static final String SNAPSHOT_NOTE = """
      The image that follows is a SNAPSHOT of the 3D scene exactly as the customer sees it now (the page being retouched, one frame, the picture shown as placed).
      Look at it before you change anything: composition and framing, where the product picture sits and how well it reads, light direction and mood, colour harmony,
      materials (flat or believable?), empty or cluttered areas, anything cut off or hidden, and how far the result is from the art director's brief.
      Then apply the CUSTOMER REQUEST first. Where the request leaves room, also fix what the snapshot shows is weak (lift a dull light, rebalance an empty corner,
      make the product picture clearer, add the missing depth, fix a clipped object). Keep everything else; the CURRENT SCENE SOURCE stays the starting point and the picture stays a picture.
      """;

  /** Last-resort scene if the resource below cannot be read: the cookbook builds a calm studio with the picture on a screen. */
  private static final String FALLBACK_MINIMAL = "function buildScene(M, brief) { M.cook.fallbackScene(); }";

  /**
   * The scene used when Agent B cannot produce valid code (and a failed retouch has no old scene to keep): a finished golden-hour living room,
   * buildScene + dressScene, loaded from the classpath resource /magic/fallback-scene.js (put the file next to shell.html and cookbook.js, e.g.
   * src/main/resources/magic/fallback-scene.js). It is only the code between the SCENE START / END markers of the demo page, no shell, no cookbook.
   * To change the fallback, replace that file; no Java change. Missing / empty file = the minimal scene above.
   */
  static final String FALLBACK_SCENE = loadFallbackScene();

  private static String loadFallbackScene() {
    try {
      String code = ReferenceStore.resource("/magic/fallback-scene.js").strip();
      if (code.contains("function buildScene")) return code;
      System.err.println("WARN /magic/fallback-scene.js has no buildScene: using the minimal fallback scene");
    } catch (RuntimeException e) {
      System.err.println("WARN /magic/fallback-scene.js not loadable (" + e.getMessage() + "): using the minimal fallback scene");
    }
    return FALLBACK_MINIMAL;
  }
}


/**
 * The only gate for Agent B's code: (1) it parses, (2) it is not obviously dangerous, (3) it defines buildScene and shows the picture.
 * Deliberately light: THREE is allowed, the cookbook API is NOT policed (a wrong cookbook name throws at run time and the studio shows the fallback scene).
 * Returns short, plain errors that Agent B can read in a repair call. Empty list = OK.
 */
final class SceneChecker {
  private SceneChecker() {}

  /** Identifiers that give network, storage, dynamic code, workers or the host page. (top / parent / self are NOT listed: too many false positives.) */
  private static final Set<String> BANNED_NAMES = Set.of("eval", "Function", "fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts",
      "Worker", "SharedWorker", "ServiceWorker", "localStorage", "sessionStorage", "indexedDB", "caches", "window", "globalThis", "navigator", "location",
      "ReactNativeWebView", "TextureLoader", "ImageLoader", "FileLoader", "ImageBitmapLoader", "Image", "Audio", "AudioContext");
  private static final Set<String> BANNED_PROPS = Set.of("constructor", "__proto__", "cookie", "sendBeacon", "postMessage", "innerHTML", "outerHTML", "insertAdjacentHTML");
  private static final Set<String> BANNED_DOCUMENT_PROPS = Set.of("cookie", "write", "writeln", "location", "domain", "body", "head", "documentElement");
  private static final Pattern DEFINES_BUILD = Pattern.compile("(function\\s+buildScene\\s*\\()|(\\bbuildScene\\s*=\\s*(async\\s*)?(function\\b|\\([^)]*\\)\\s*=>|[A-Za-z_$][\\w$]*\\s*=>))");
  private static final Pattern SHOWS_IMAGE = Pattern.compile("\\.(screen|tv|frame|portal)\\s*\\(|\\bimage\\s*\\.\\s*texture");
  private static final Pattern RANDOM = Pattern.compile("Math\\s*\\.\\s*random\\s*\\(");

  static List<String> check(String code) {
    List<String> errs = new ArrayList<>();
    if (code == null || code.isBlank()) {
      errs.add("the reply contains no buildScene code (reply must be {\"buildScene\": \"function buildScene(M, brief) {...}\"})");
      return errs;
    }
    if (code.length() > Config.MAX_SCENE_CHARS) { errs.add("scene code is longer than " + Config.MAX_SCENE_CHARS + " characters; make it more compact"); return errs; }

    Compiler compiler = new Compiler();
    CompilerOptions o = new CompilerOptions();
    o.setLanguageIn(CompilerOptions.LanguageMode.ECMASCRIPT_2020);
    o.setChecksOnly(true);
    compiler.compile(List.<SourceFile>of(), List.of(SourceFile.fromCode("scene.js", code)), o);
    for (JSError e : compiler.getErrors()) errs.add("syntax error on line " + e.getLineno() + ": " + e.getDescription());
    if (!errs.isEmpty()) return errs.stream().distinct().limit(8).toList();

    Node jsRoot = compiler.getRoot().getLastChild();               // root = [externs, scene]: walk ONLY the scene (the built-in externs declare window, Function, globalThis ...)
    NodeUtil.visitPreOrder(jsRoot, n -> {
      if (n.getLineno() <= 0) return;                               // synthetic nodes are not the model's code
      if (n.isName() && BANNED_NAMES.contains(n.getString()) && !isPropertyKeyOrMember(n))
        errs.add("'" + n.getString() + "' is not allowed (line " + n.getLineno() + "); the scene has no network, storage or page access");
      if (n.isImport() || n.isExport() || n.getToken() == Token.DYNAMIC_IMPORT) errs.add("import / export / import() is not allowed; THREE is already in scope");
      if (n.isGetProp() && BANNED_PROPS.contains(n.getString())) errs.add("property '." + n.getString() + "' is not allowed (line " + n.getLineno() + ")");
      if (n.isGetProp() && n.getFirstChild().isName() && "document".equals(n.getFirstChild().getString()) && BANNED_DOCUMENT_PROPS.contains(n.getString()))
        errs.add("document." + n.getString() + " is not allowed (line " + n.getLineno() + ")");
      if (n.isGetElem() && n.getLastChild().isStringLit() && BANNED_PROPS.contains(n.getLastChild().getString()))
        errs.add("property ['" + n.getLastChild().getString() + "'] is not allowed (line " + n.getLineno() + ")");
      if (n.isCall() && n.getFirstChild().isName() && Set.of("setTimeout", "setInterval").contains(n.getFirstChild().getString()) && n.getSecondChild() != null && n.getSecondChild().isStringLit())
        errs.add("setTimeout / setInterval with a string is not allowed");
    });
    if (RANDOM.matcher(code).find()) errs.add("Math.random() is not allowed: use M.random.next() (seeded) so the scene is reproducible");
    if (!DEFINES_BUILD.matcher(code).find()) errs.add("function buildScene(M, brief) is not defined");
    if (!SHOWS_IMAGE.matcher(code).find()) errs.add("the customer's picture is never shown: call M.cook.screen / tv / frame / portal (or use M.image.texture) at least once");
    return errs.stream().distinct().limit(10).toList();
  }

  private static final Pattern DEFINES_DRESS = Pattern.compile("function\\s+dressScene\\s*\\(");
  private static final Pattern RETURNS_CTX = Pattern.compile("\\breturn\\s*\\{");

  /** Advanced stage 2: the combined code (stage 1 + dressScene) must pass the normal check and define dressScene. */
  static List<String> checkDress(String stage1Code, String dressCode) {
    if (dressCode == null || dressCode.isBlank()) return List.of("the reply contains no dressScene code (reply must be {\"dressScene\": \"function dressScene(M, brief, ctx) {...}\"})");
    List<String> errs = new ArrayList<>();
    if (!DEFINES_DRESS.matcher(dressCode).find()) errs.add("function dressScene(M, brief, ctx) is not defined");
    if (DEFINES_BUILD.matcher(dressCode).find()) errs.add("do not define buildScene again: write only dressScene");
    errs.addAll(check(stage1Code + "\n" + dressCode));
    return errs.stream().distinct().limit(10).toList();
  }

  /** `{ window: 1 }` or `obj.window` are not the global; only a free identifier is. In Closure's AST a property key is not a NAME node, so this is a safety net only. */
  private static boolean isPropertyKeyOrMember(Node n) {
    Node p = n.getParent();
    return p != null && (p.isStringKey() || p.isMemberFunctionDef());
  }
}


/** Reads Agent B's reply and merges shell.html + cookbook.js + brief + scene code into the final page (twin of the local assemble.js). */
final class MagicHtmlAssembler {
  private MagicHtmlAssembler() {}
  private static final Pattern PLACEHOLDER = Pattern.compile("\\{\\{(TITLE|THREE_URL|COOKBOOK|BRIEF_JSON|SCENE_CODE)}}");
  private static final Pattern BRIEF_CONST = Pattern.compile("const BRIEF = (\\{.*?});\\s*\\n", Pattern.DOTALL);

  /** Agent B reply -> plain JS. Accepts {"buildScene":"..."} (also with a ``` fence or text around it) or a bare function. "" if nothing usable. */
  public static String extractBuildScene(String reply) { return extractFunction(reply, "buildScene"); }

  /** Advanced stage 2: {"dressScene":"..."}. */
  public static String extractDressScene(String reply) { return extractFunction(reply, "dressScene"); }

  private static String extractFunction(String reply, String key) {
    if (reply == null) return "";
    String s = reply.strip();
    if (s.startsWith("```")) s = s.replaceFirst("^```[a-zA-Z]*\\s*", "").replaceFirst("\\s*```\\s*$", "").strip();
    try {
      int a = s.indexOf('{'), b = s.lastIndexOf('}');
      if (a >= 0 && b > a) {
        JsonElement el = JsonParser.parseString(s.substring(a, b + 1));
        if (el.isJsonObject() && el.getAsJsonObject().has(key)) return el.getAsJsonObject().get(key).getAsString().strip();
      }
    } catch (JsonParseException | IllegalStateException ignore) { /* try the bare-function path */ }
    int f = s.indexOf("function " + key);
    if (f >= 0) { int end = s.lastIndexOf('}'); if (end > f) return s.substring(f, end + 1); }
    return "";
  }

  /** Merge into the final page. Throws IllegalArgumentException only for a bad brief / oversized page (never for model code: SceneChecker did that). */
  public static String assemble(String shellHtml, String cookbookJs, String briefJson, String sceneCode, String threeUrl) {
    String brief = new Gson().toJson(JsonParser.parseString(briefJson))                         // re-serialised: guaranteed valid JSON
        .replace("</", "<\\/").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029");
    String code = sceneCode.replace("</script", "<\\/script").replace("</SCRIPT", "<\\/SCRIPT"); // generated code can never close the script tag
    Map<String, String> v = Map.of("TITLE", "Magic 3D Studio", "THREE_URL", threeUrl, "COOKBOOK", cookbookJs, "BRIEF_JSON", brief, "SCENE_CODE", code);
    Matcher m = PLACEHOLDER.matcher(shellHtml);                                                 // one pass: a "{{...}}" inside the code is never expanded
    StringBuilder sb = new StringBuilder();
    while (m.find()) m.appendReplacement(sb, Matcher.quoteReplacement(v.get(m.group(1))));
    m.appendTail(sb);
    String html = sb.toString();
    if (html.length() > Config.MAX_PAGE_CHARS) throw new IllegalArgumentException("page larger than " + Config.MAX_PAGE_CHARS + " characters");
    return html;
  }

  /** For Retouch: the scene code of a page this Lambda made earlier. */
  public static String sceneOf(String html) { return ReferenceStore.extractSceneSection(html); }

  /** For Retouch: the brief JSON of a page this Lambda made earlier ("{}" if not found). */
  public static String briefOf(String html) {
    Matcher m = BRIEF_CONST.matcher(html == null ? "" : html);
    return m.find() ? m.group(1).replace("<\\/", "</") : "{}";
  }
}


/**
 * Optional "critic without a renderer". Sends the scene code to a tiny Node.js Lambda (auditor_handler.js + audit.js, Function URL) that RUNS the code on the
 * real Three.js scene graph without any GPU or browser, steps the camera path in simulated time and returns plain-language issues:
 * runtime errors, picture visible / size, empty views, camera inside a solid, draw calls, triangles, lights. Empty list = nothing to fix.
 * Env: AUDITOR_URL (Lambda Function URL; unset = audit disabled), AUDITOR_TIMEOUT_MS (default 8000). Any failure of the auditor returns an empty list.
 */
final class SceneAuditor {
  private SceneAuditor() {}
  private static final java.net.http.HttpClient HTTP = java.net.http.HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();

  static boolean enabled() { return !LlmClient.env("AUDITOR_URL", "").isBlank(); }

  static List<String> audit(String sceneCode, String briefJson) throws IOException, InterruptedException {
    JsonObject req = new JsonObject();
    req.addProperty("scene", sceneCode);
    req.addProperty("cookbook", Agents.COOKBOOK_JS);
    req.addProperty("brief", briefJson);
    java.net.http.HttpRequest r = java.net.http.HttpRequest.newBuilder(URI.create(LlmClient.env("AUDITOR_URL", "")))
        .timeout(Duration.ofMillis(Long.parseLong(LlmClient.env("AUDITOR_TIMEOUT_MS", "8000"))))
        .header("content-type", "application/json").POST(java.net.http.HttpRequest.BodyPublishers.ofString(req.toString())).build();
    List<String> out = new ArrayList<>();
    try {
      java.net.http.HttpResponse<String> resp = HTTP.send(r, java.net.http.HttpResponse.BodyHandlers.ofString());
      if (resp.statusCode() / 100 != 2) return out;
      JsonObject o = JsonParser.parseString(resp.body()).getAsJsonObject();
      JsonArray a = o.has("issues") && o.get("issues").isJsonArray() ? o.getAsJsonArray("issues") : new JsonArray();
      a.forEach(x -> out.add(x.getAsString()));
    } catch (IOException | RuntimeException e) {
      return new ArrayList<>(); // the audit must never break generation
    }
    return out;
  }
}

//MAGIC-STUDIO-AGENTS

/**
 * The two agents and the orchestration.
 *
 *   Agent A  buildCreativeBriefAgent : customer image + request + reference screenshots (PNG)       -> creative brief (free-form JSON)
 *   Agent B  buildSceneAgent         : brief + customer image + reference scene code + cookbook index -> scene section  function buildScene(M, brief)
 *   generate3dScene(...)  A -> B -> SceneChecker -> (repair B once) -> assemble with shell.html + cookbook.js -> final html
 *   retouch3dScene(...)   previous page + instruction -> B (previous scene code as the starting point) -> same checks
 *
 * Lambda handler example:
 *   SceneResult r = Agents.generate3dScene(imageBase64, prompt);      // never throws; r.html() is always a usable page
 *   return r.html();                                                   // r.notes() / r.usedFallback() -> your metrics
 */
final class Agents {
  private Agents() {}
  private static final Gson GSON = new GsonBuilder().disableHtmlEscaping().create();

  // trusted files, loaded once per Lambda container (classpath /magic/) 
  private static final String SHELL_HTML = ReferenceStore.resource("/magic/shell.html");
  static final String COOKBOOK_JS = ReferenceStore.resource("/magic/cookbook.js");
  private static final String COOKBOOK_INDEX = ReferenceStore.cookbookIndex(COOKBOOK_JS);

  /** The Brief that Agent A produced. json = what Agent B and the page receive (seed added by Java). */
  public record Brief(String json, List<String> referenceIds, boolean fromAgent) {}

  /** What the Lambda returns. html is always set. */
  public record SceneResult(String html, boolean usedFallback, String briefJson, List<String> notes) {}

  // ---------------------------------------------------------------------------------------------------------------------
  // AGENT A: art director
  // ---------------------------------------------------------------------------------------------------------------------
  /**
 - may be null / blank for a retouch whose picture could not be found in storage
   * @param userPrompt       the customer's request (may be empty)
   * @param refs             the picked references (their screenshots are sent as images)
   * @return the brief; when the model reply is unusable twice, a plain default brief (fromAgent = false). Never throws.
   */
  public static Brief buildCreativeBriefAgent(String sceneImageBase64, String userPrompt, List<Reference> refs) {
    List<Part> parts = new ArrayList<>();
    parts.add(Part.text("CUSTOMER REQUEST", blankToNone(userPrompt)));
    parts.add(Part.text("CUSTOMER IMAGE", "This is the customer's picture. It must be the hero of the 3D scene."));
    if (sceneImageBase64 != null && !sceneImageBase64.isBlank()) parts.add(Part.image("customer image", sceneImageBase64));
    for (Reference r : refs) {
      parts.add(Part.text("REFERENCE SCENE '" + r.name() + "'", "A screenshot of the finished reference scene with id \"" + r.name() + "\" follows."));
      parts.add(Part.image("reference " + r.name(), r.imageBase64()));
    }
    parts.add(Part.text("TASK", "Write the creative brief now as one JSON object. Reference ids you may use: " + ids(refs) + "."));

    Set<String> valid = new LinkedHashSet<>();
    for (Reference r : refs) valid.add(r.name());
    for (int attempt = 0; attempt < 2; attempt++) {
      try {
        String reply = LlmClient.complete(Config.MODEL_A, Prompts.ART_DIRECTOR, parts, Config.PARAMS_A);
        JsonObject o = parseJsonObject(reply);
        if (o == null || !o.has("concept") || o.get("concept").getAsString().isBlank()) continue;      // only check: a concept exists
        List<String> used = new ArrayList<>();
        if (o.has("references") && o.get("references").isJsonArray())
          for (JsonElement e : o.getAsJsonArray("references")) if (e.isJsonPrimitive() && valid.contains(e.getAsString()) && !used.contains(e.getAsString())) used.add(e.getAsString());
        if (used.isEmpty()) used.addAll(valid);                                                         // unknown / missing ids -> use all picked ones
        o.add("references", GSON.toJsonTree(used));
        o.addProperty("seed", new Random().nextInt(1_000_000_000));
        return new Brief(GSON.toJson(o), used, true);
      } catch (IOException | RuntimeException e) {
        System.err.println("WARN agent A attempt " + (attempt + 1) + ": " + e.getMessage());
      } catch (InterruptedException e) { Thread.currentThread().interrupt(); break; }
    }
    return defaultBrief(refs);
  }

  // ---------------------------------------------------------------------------------------------------------------------
  // AGENT B: creative developer
  // ---------------------------------------------------------------------------------------------------------------------
  /** First call: brief -> scene code. Returns the extracted JavaScript ("" if the reply held no code). */
  public static String buildSceneAgent(Brief brief, String sceneImageBase64, String userPrompt, List<Reference> refs) throws IOException, InterruptedException {
    return call(brief, sceneImageBase64, userPrompt, refs, null, null, false);
  }

  /** Repair call: the previous code + the checker's errors -> corrected scene code. */
  public static String buildSceneAgent(Brief brief, String sceneImageBase64, String userPrompt, List<Reference> refs, String previousCode, List<String> errors) throws IOException, InterruptedException {
    return call(brief, sceneImageBase64, userPrompt, refs, previousCode, errors, false);
  }

  /** Retouch call: the scene code of the existing page + the customer's change request -> updated scene code. */
  static String buildRetouchAgent(Brief brief, String sceneImageBase64, String instruction, List<Reference> refs, String currentCode) throws IOException, InterruptedException {
    return call(brief, sceneImageBase64, instruction, refs, currentCode, null, true);
  }

  /** Retouch with a snapshot of the 3D view as the customer sees it now (null = same as above). */
  static String buildRetouchAgent(Brief brief, String sceneImageBase64, String instruction, List<Reference> refs, String currentCode, String snapshot) throws IOException, InterruptedException {
    return call(brief, sceneImageBase64, instruction, refs, currentCode, null, true, Prompts.CREATIVE_DEVELOPER, Config.MODEL_B, Config.PARAMS_B, "buildScene", snapshot);
  }

  /** The optional 3D snapshot: plain base64 (a data: prefix is fine), a real image of a sane size. Anything else = null, and the retouch runs without it. */
  static String usableSnapshot(String b64, List<String> notes) {
    if (b64 == null || b64.isBlank()) return null;
    try {
      String raw = b64.startsWith("data:") && b64.contains(",") ? b64.substring(b64.indexOf(',') + 1) : b64;
      byte[] bytes = java.util.Base64.getMimeDecoder().decode(raw.trim());
      boolean png = bytes.length > 8 && (bytes[0] & 0xff) == 0x89 && bytes[1] == 'P';
      boolean jpg = bytes.length > 3 && (bytes[0] & 0xff) == 0xFF && (bytes[1] & 0xff) == 0xD8;
      if (bytes.length < 2048 || bytes.length > 6_000_000 || !(png || jpg)) { notes.add("3D snapshot ignored (not a usable PNG / JPEG: " + bytes.length + " bytes)"); return null; }
      return raw.trim();
    } catch (RuntimeException e) {
      notes.add("3D snapshot ignored (unreadable: " + e.getMessage() + ")");
      return null;
    }
  }

  /** Advanced stage 1 (skeleton that returns ctx): same as buildSceneAgent but with the stage-1 addendum. */
  static String buildSkeletonAgent(Brief brief, String img, String userPrompt, List<Reference> refs, String previousCode, List<String> errors) throws IOException, InterruptedException {
    return call(brief, img, userPrompt, refs, previousCode, errors, false, Prompts.CREATIVE_DEVELOPER + Prompts.STAGE1_ADDENDUM, Config.MODEL_B, Config.PARAMS_B, "buildScene");
  }

  /** Advanced stage 2: the stage-1 code (read only) -> function dressScene(M, brief, ctx). previousDress + errors = repair. */
  static String dressSceneAgent(Brief brief, String img, String userPrompt, List<Reference> refs, String stage1Code, String previousDress, List<String> errors) throws IOException, InterruptedException {
    List<Part> parts = new ArrayList<>();
    if (errors != null) parts.add(Part.text("TASK", Prompts.REPAIR));
    parts.add(Part.text("ART DIRECTOR BRIEF (JSON)", brief.json()));
    parts.add(Part.text("CUSTOMER REQUEST", blankToNone(userPrompt)));
    addCustomerImage(parts, img);
    parts.add(Part.text("COOKBOOK API INDEX (M.cook.*)", COOKBOOK_INDEX));
    parts.add(Part.text("RUNTIME CONTRACT", Prompts.RUNTIME_CONTRACT));
    parts.add(Part.text("STAGE 1 SOURCE (already written, runs first, do not repeat or change it)", stage1Code));
    if (previousDress != null && !previousDress.isBlank()) parts.add(Part.text("PREVIOUS dressScene (rejected)", previousDress));
    if (errors != null) parts.add(Part.text("CHECKER ERRORS", String.join("\n", errors.stream().map(e -> "- " + e).toList())));
    parts.add(Part.text("OUTPUT", "Reply with the JSON object {\"dressScene\": \"...\"} only."));
    String reply = LlmClient.complete(Config.MODEL_B2, Prompts.CREATIVE_DEVELOPER + Prompts.STAGE2_ADDENDUM, parts, Config.PARAMS_B2);
    return MagicHtmlAssembler.extractDressScene(reply);
  }

  /** The customer picture, when there is one. A retouch of an old item may have none (the cloud could not store it): the agent then works from the brief and the current scene source. */
  private static void addCustomerImage(List<Part> parts, String img) {
    if (img == null || img.isBlank()) {
      parts.add(Part.text("CUSTOMER IMAGE", "NOT AVAILABLE for this request. Rely on the ART DIRECTOR BRIEF (it describes the product) and the CURRENT SCENE SOURCE. At run time M.image.texture still holds the real picture, so keep every screen / picture call exactly as it is."));
      return;
    }
    parts.add(Part.text("CUSTOMER IMAGE", "This is the picture that M.image.texture holds at run time."));
    parts.add(Part.image("customer image", img));
  }

  private static String call(Brief brief, String img, String userPrompt, List<Reference> refs, String previousCode, List<String> errors, boolean retouch) throws IOException, InterruptedException {
    return call(brief, img, userPrompt, refs, previousCode, errors, retouch, Prompts.CREATIVE_DEVELOPER, Config.MODEL_B, Config.PARAMS_B, "buildScene");
  }

  private static String call(Brief brief, String img, String userPrompt, List<Reference> refs, String previousCode, List<String> errors, boolean retouch, String system, String model, LlmParams params, String key) throws IOException, InterruptedException {
    return call(brief, img, userPrompt, refs, previousCode, errors, retouch, system, model, params, key, null);
  }

  /** snapshot: optional screenshot of the 3D page being retouched (retouch only); null = the retouch works from the source, brief and picture as before. */
  private static String call(Brief brief, String img, String userPrompt, List<Reference> refs, String previousCode, List<String> errors, boolean retouch, String system, String model, LlmParams params, String key, String snapshot) throws IOException, InterruptedException {
    List<Part> parts = new ArrayList<>();
    if (retouch) parts.add(Part.text("TASK", Prompts.RETOUCH));
    else if (errors != null) parts.add(Part.text("TASK", Prompts.REPAIR));
    parts.add(Part.text("ART DIRECTOR BRIEF (JSON)", brief.json()));
    parts.add(Part.text("CUSTOMER REQUEST", blankToNone(userPrompt)));
    addCustomerImage(parts, img);
    if (retouch && snapshot != null) {
      parts.add(Part.text("CURRENT 3D VIEW (SNAPSHOT)", Prompts.SNAPSHOT_NOTE));
      parts.add(Part.image("current 3d view", snapshot));
    }
    parts.add(Part.text("COOKBOOK API INDEX (M.cook.*)", COOKBOOK_INDEX));
    parts.add(Part.text("RUNTIME CONTRACT", Prompts.RUNTIME_CONTRACT));
    for (Reference r : refs)                                                                            // loop: 1 reference today, 2-3 later, no code change
      parts.add(Part.text("REFERENCE SCENE CODE '" + r.name() + "' (finished, works; learn from it, do not copy its world)", r.sceneCode()));
    if (previousCode != null) parts.add(Part.text(retouch ? "CURRENT SCENE SOURCE (change this)" : "PREVIOUS SOURCE (rejected)", previousCode));
    if (errors != null) parts.add(Part.text("CHECKER ERRORS", String.join("\n", errors.stream().map(e -> "- " + e).toList())));
    parts.add(Part.text("OUTPUT", "Reply with the JSON object {\"buildScene\": \"...\"} only."));
    String reply = LlmClient.complete(model, system, parts, params);
    return MagicHtmlAssembler.extractBuildScene(reply);
  }

  // ---------------------------------------------------------------------------------------------------------------------
  // ORCHESTRATION
  // ---------------------------------------------------------------------------------------------------------------------
  /** Quality marker in the input file name, right before the device id: "...-view-standard-<deviceId>.png" or "...-view-advanced-<deviceId>.png". Anything else = standard. */
  public static boolean advancedFromFileName(String fileName) {
    return fileName != null && fileName.toLowerCase(Locale.ROOT).contains("advanced");
  }

  /** Generate 3D scene with the quality taken from the input file name (the app writes standard / advanced before the device id). Never throws. */
  public static SceneResult generate3dScene(String sceneImageBase64, String userPrompt, String inputFileName) {
    return generate3dScene(sceneImageBase64, userPrompt, advancedFromFileName(inputFileName));
  }

  /** Generate 3D scene: image + prompt -> final html. Standard = the single-pass Agent B (as before). Never throws. */
  public static SceneResult generate3dScene(String sceneImageBase64, String userPrompt) {
    return generate3dScene(sceneImageBase64, userPrompt, false);
  }

  /** advanced = two-stage Agent B (skeleton returning ctx, then dressScene). */
  public static SceneResult generate3dScene(String sceneImageBase64, String userPrompt, boolean advanced) {
    List<String> notes = new ArrayList<>();
    notes.add("quality=" + (advanced ? "advanced" : "standard"));
    List<Reference> refs = ReferenceStore.pickRandom(Config.REFERENCES_PER_REQUEST);
    notes.add("references=" + ids(refs));
    Brief brief = buildCreativeBriefAgent(sceneImageBase64, userPrompt, refs);
    if (!brief.fromAgent()) notes.add("agent A failed: default brief");
    return writeScene(brief, sceneImageBase64, userPrompt, refs, null, notes, advanced);
  }

  /**
   * Retouch: the customer's change request applied to the page this Lambda made earlier.
   * @param previousHtml the page of the scene being retouched (its scene code and brief are read back from it)
   */
  public static SceneResult retouch3dScene(String sceneImageBase64, String instruction, String previousHtml) {
    return retouch3dScene(sceneImageBase64, instruction, previousHtml, null);
  }

  /** previousBriefJson: optional, when the caller keeps the brief itself; null / blank = read it back from the page (it is embedded as `const BRIEF = {...};`). */
  public static SceneResult retouch3dScene(String sceneImageBase64, String instruction, String previousHtml, String previousBriefJson) {
    return retouch3dScene(sceneImageBase64, instruction, previousHtml, previousBriefJson, null);
  }

  /**
   * Retouch with the optional snapshot of the 3D canvas (the file `<key>-4retouch-3dsnapshot-<device>.png` the app uploads next to the page).
   * snapshotBase64 null / blank / unreadable = exactly the retouch without it; the agent only sees it when it is a real image.
   */
  public static SceneResult retouch3dScene(String sceneImageBase64, String instruction, String previousHtml, String previousBriefJson, String snapshotBase64) {
    List<String> notes = new ArrayList<>(List.of("retouch"));
    String snapshot = usableSnapshot(snapshotBase64, notes);
    if (snapshot != null) notes.add("3D snapshot sent to agent B");
    String current = MagicHtmlAssembler.sceneOf(previousHtml);
    String briefJson = previousBriefJson != null && parseJsonObject(previousBriefJson) != null ? previousBriefJson : MagicHtmlAssembler.briefOf(previousHtml);
    List<Reference> refs = new ArrayList<>();
    try {                                                                                              // same references as the original scene when it names them
      JsonObject b = parseJsonObject(briefJson);
      if (b != null && b.has("references")) for (JsonElement e : b.getAsJsonArray("references")) refs.add(ReferenceStore.load(e.getAsString()));
    } catch (IOException | RuntimeException e) { notes.add("references of the original scene not loadable: " + e.getMessage()); }
    if (refs.isEmpty()) refs = ReferenceStore.pickRandom(Config.REFERENCES_PER_REQUEST);
    Brief brief = new Brief(briefJson, refs.stream().map(Reference::name).toList(), true);
    if (current.isBlank()) { notes.add("no scene code in the previous page: generating a new scene"); return generate3dScene(sceneImageBase64, instruction); }
    return writeScene(brief, sceneImageBase64, instruction, refs, current, notes, false, snapshot);
  }

  /** B -> check -> repair (MAX_REPAIRS times) -> assemble. `retouchFrom` != null means retouch mode. */
  private static SceneResult writeScene(Brief brief, String img, String prompt, List<Reference> refs, String retouchFrom, List<String> notes, boolean advanced) {
    return writeScene(brief, img, prompt, refs, retouchFrom, notes, advanced, null);
  }

  private static SceneResult writeScene(Brief brief, String img, String prompt, List<Reference> refs, String retouchFrom, List<String> notes, boolean advanced, String snapshot) {
    boolean two = advanced && retouchFrom == null;
    String code = "";
    List<String> errors = List.of("no attempt made");
    try {
      if (retouchFrom != null) {
        try {
          code = snapshot != null ? buildRetouchAgent(brief, img, prompt, refs, retouchFrom, snapshot) : buildRetouchAgent(brief, img, prompt, refs, retouchFrom);
        } catch (IOException | RuntimeException e) {
          if (snapshot == null) throw e;
          notes.add("retouch with the 3D snapshot failed (" + e.getMessage() + "): retrying without it");        // the snapshot is a bonus, never a reason to fail
          code = buildRetouchAgent(brief, img, prompt, refs, retouchFrom);
        }
      } else code = two ? buildSkeletonAgent(brief, img, prompt, refs, null, null) : buildSceneAgent(brief, img, prompt, refs);
      errors = SceneChecker.check(code);
      for (int i = 0; i < Config.MAX_REPAIRS && !errors.isEmpty(); i++) {
        notes.add("repair " + (i + 1) + ": " + String.join(" | ", errors));
        String prev = code.isBlank() ? (retouchFrom == null ? "" : retouchFrom) : code;
        code = two ? buildSkeletonAgent(brief, img, prompt, refs, prev, errors) : buildSceneAgent(brief, img, prompt, refs, prev, errors);
        errors = SceneChecker.check(code);
      }
      if (two && errors.isEmpty()) {                                                                 // stage 2: dress the checked skeleton; any failure keeps stage 1
        try {
          String dress = dressSceneAgent(brief, img, prompt, refs, code, null, null);
          List<String> dErr = SceneChecker.checkDress(code, dress);
          for (int i = 0; i < Config.MAX_REPAIRS && !dErr.isEmpty(); i++) {
            notes.add("stage 2 repair " + (i + 1) + ": " + String.join(" | ", dErr));
            dress = dressSceneAgent(brief, img, prompt, refs, code, dress, dErr);
            dErr = SceneChecker.checkDress(code, dress);
          }
          if (dErr.isEmpty()) { code = code + "\n\n" + dress; notes.add("stage 2 applied"); }
          else notes.add("stage 2 dropped, stage 1 delivered: " + String.join(" | ", dErr));
        } catch (IOException | RuntimeException e) {
          notes.add("stage 2 failed, stage 1 delivered: " + e.getMessage());
        }
      }
    } catch (IOException | RuntimeException e) {
      errors = List.of("agent B call failed: " + e.getMessage());
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      errors = List.of("interrupted");
    }
    if (errors.isEmpty() && retouchFrom == null && !two && Config.MAX_AUDIT_REPAIRS > 0 && SceneAuditor.enabled()) { // (audit repair is for the single-pass scene)
      try {
        for (int i = 0; i < Config.MAX_AUDIT_REPAIRS; i++) {
          List<String> issues = SceneAuditor.audit(code, brief.json());
          if (issues.isEmpty()) break;
          notes.add("audit " + (i + 1) + ": " + String.join(" | ", issues));
          String better = two ? buildSkeletonAgent(brief, img, prompt, refs, code, issues) : buildSceneAgent(brief, img, prompt, refs, code, issues);
          List<String> again = SceneChecker.check(better);
          if (!again.isEmpty()) { notes.add("audit repair rejected: " + String.join(" | ", again)); break; } // keep the code that passed the checker
          code = better;
        }
      } catch (IOException | RuntimeException e) {
        notes.add("audit skipped: " + e.getMessage());
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
      }
    }
    boolean fallback = !errors.isEmpty();
    if (fallback) {
      notes.add("FALLBACK scene: " + String.join(" | ", errors));
      code = retouchFrom != null && SceneChecker.check(retouchFrom).isEmpty() ? retouchFrom : Prompts.FALLBACK_SCENE; // failed retouch keeps the old scene
    }
    String html = MagicHtmlAssembler.assemble(SHELL_HTML, COOKBOOK_JS, brief.json(), code, Config.THREE_URL);
    return new SceneResult(html, fallback, brief.json(), notes);
  }

  // ---------------------------------------------------------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------------------------------------------------------
  static Brief defaultBrief(List<Reference> refs) {
    JsonObject o = new JsonObject();
    o.addProperty("concept", "A calm, beautifully lit scene where the customer's picture is shown large on a screen or in a frame, with a slow camera move and soft atmosphere.");
    o.add("references", GSON.toJsonTree(refs.stream().map(Reference::name).toList()));
    o.addProperty("seed", new Random().nextInt(1_000_000_000));
    return new Brief(GSON.toJson(o), refs.stream().map(Reference::name).toList(), false);
  }

  /** First JSON object inside a model reply (tolerates ``` fences and prose around it); null if none parses. */
  static JsonObject parseJsonObject(String s) {
    if (s == null) return null;
    int a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try { JsonElement e = JsonParser.parseString(s.substring(a, b + 1)); return e.isJsonObject() ? e.getAsJsonObject() : null; }
    catch (JsonParseException ex) { return null; }
  }

  private static String ids(List<Reference> refs) { return refs.stream().map(Reference::name).toList().toString(); }
  private static String blankToNone(String s) { return s == null || s.isBlank() ? "(none: choose what suits the picture best)" : s; }
} 

//----------------------------------------------------------------------------------------------------------------------------

//END MAGIC STUDIO AGENTS

//----------------------------------------------------------------------------------------------------------------------------



// Handler class: ai-illustwitter.MagicStudioHandler
public class MagicStudioHandler implements RequestHandler<S3Event, String> {
 
	protected static final String VIDEO_MIME = (String) "video/mp4";
	protected static final String GLB_MIME = (String) "model/gltf-binary";

	private final String JPG_TYPE = (String) "jpg";
	private final String JPG_FULL_TYPE = (String) "jpeg";
	private final String JPG_MIME = (String) "image/jpeg";

	protected static final String PNG_TYPE = (String) "png";
	protected static final String PNG_MIME = (String) "image/png";
	protected static final String IMAGE_MIME = (String) "image";

	protected static final String PDF_TYPE = (String) "pdf";
	protected static final String PDF_MIME = (String) "application/pdf";

	private final String TXT_TYPE = (String) "txt";
	private final String TXT_MIME = (String) "text/plain";

	private static final String AWS_ACCESS_KEY = (String) "YOUR KEY"; 
	private static final String AWS_SECRET_KEY = (String) "YOUR SCRET"; 
	protected static final String BUCKET_NAME = (String) "YOUR BUCKET NAME"; 
	protected static final String BLACKLIST_NAME = (String) "blacklist.txt";
	protected static final String WHITELIST_NAME = (String) "whitelist.txt";
	protected static final String QUALITYLIST_NAME = (String) "qualitylist.txt";
	protected static final String STYLELIST_NAME = (String) "stylelist.txt";
	protected static final String BUCKET_OUT = (String) "YOUR BUCKET OUT NAME";   

	@Override
	public String handleRequest(S3Event s3event, Context context) {
		try {

			S3EventNotificationRecord record = s3event.getRecords().get(0); 
			String srcBucket = record.getS3().getBucket().getName();

			// Object key may have spaces or unicode non-ASCII characters.
			String srcKey = record.getS3().getObject().getUrlDecodedKey();

			String dstKey = srcKey.substring(0, srcKey.length() - 4); // skip the .txt postfix

			String strFullFileName = srcKey; 

			// Infer the file type.
			Matcher matcher = Pattern.compile(".*\\.([^\\.]*)").matcher(srcKey);
			if (!matcher.matches()) {
				System.out.println("Unable to infer file type for key " + srcKey);
				return "";
			}
			String fileType = matcher.group(1); 
 

			if ((JPG_TYPE.equals(fileType)) || (PNG_TYPE.equals(fileType)) || (JPG_FULL_TYPE.equals(fileType))) {
			 
			} else {// processing txt file that contain the prompt for text to image function
 

				//MAGIC STUDIO HANDLE REQUEST
				System.out.println("STARTING PROCESS FOR MAGIC STUDIO.... : " + strFullFileName);
				int iCompleted = generateImagesAnd3DScene(strFullFileName);
				if (iCompleted == 0){
					System.out.println("DONE generateImagesAnd3DScene, RETURN OK...");
					return "completed";
				} 

				//END MAGIC STUDIO HANDLE REQUEST

		} catch (Exception e) {
			throw new RuntimeException(e);
		}
		return "Ok";
	} // end handleRequest function

	//MAGIC STUDIO
	private int generateImagesAnd3DScene(String strFullFileName){
		int result = 0; 

		String strPrompt ="Rebuild the image as a high quality, realistic 3D scene, including whatever in the background. Return one self-contained index.html that loads Three.js from a CDN with an import map, models the product foregeound image in scene with super realistic using realistic environment map, HDR, tone mapping, Physically Based Rendering (PBR), proper lighting calculations, shadow maps, and post-processing. Matches the colors from the photo, uses soft studio lighting on beautiful background, and slowly turns the product around. Return only the HTML file in a single code block." +
		" . Deliver ONLY the complete, fully working HTML code containing the import maps, CDN links for threejs, css styling and JavaScript scene in a single code block. NO EXPLAINATIONS";

		String filePath = strFullFileName.replace(".txt",".png");
		String htmlFilePath = strFullFileName.replace(".txt",".html");

		String strImageName = filePath.substring(filePath.lastIndexOf('/') + 1); 

		try{

 			String input_image_base64 = null; 

			try{

			AmazonS3 s3Client = AmazonS3ClientBuilder.defaultClient();

            ResponseHeaderOverrides headerOverrides = new ResponseHeaderOverrides()
                    .withContentType("image/png")
                    .withCacheControl("No-cache")
                    .withContentDisposition("attachment; filename=temp.png");
            GetObjectRequest getObjectRequestHeaderOverride = new GetObjectRequest(BUCKET_OUT, filePath)
                    .withResponseHeaders(headerOverrides);
            S3Object headerOverrideObject = s3Client.getObject(getObjectRequestHeaderOverride);

            byte[] blob_image = IOUtils.toByteArray(headerOverrideObject.getObjectContent());
           
            input_image_base64 = Base64.encodeBase64String(blob_image);
			}catch(Exception ex){
				System.out.println("Error during fetch input image in generateImagesAnd3DScene: " + ex.getMessage());
			}

			if(!strFullFileName.contains("-4retouch-") && !isValidBase64(input_image_base64)){
				//Can't not fetch the input image, exit except the case of Retouch we can continue without image
				return -1;
			}
			
			if(!input_image_base64.startsWith("data:image/png;base64,")){ 
				input_image_base64 = "data:image/png;base64," + input_image_base64;
			}  	 

			if(strFullFileName.contains("-4harmonize-")){
				String strHarmonizedImageName = strFullFileName.replace("-4harmonize-","-harmonize-");
				strHarmonizedImageName = strHarmonizedImageName.replace(".txt",".png");
				String strHarmonizePrompt = "Harmonize this image, transform the image so the foreground image blended seamlessly and naturally with the background image, make sure to make a beautiful image with studio quality lighting and color grading, super quality, super resolution";
				 
				generate_multi_angles_image(input_image_base64, strHarmonizedImageName, strHarmonizePrompt); 
			 
				return 0;
			}

			if(strFullFileName.contains("-4retouch-")){
				String strRetouchImageName = strFullFileName.replace("-4retouch-","-retouch-");
				strRetouchImageName = strRetouchImageName.replace(".txt",".html");
				String strRetouchPrompt = "Enhance the 3D scene, make sure the 3D scene is beautiful, studio quality lighting and color grading, super quality, super resolution";
				 
				retouch_Agents_AlphaTeam(strRetouchPrompt,input_image_base64, strRetouchImageName,strFullFileName); 
				 
				return 0;
			}

			String sceneBase64 = generateSceneImage(strFullFileName,input_image_base64);
			if(!sceneBase64.startsWith("data:image/png;base64,")){ 
				sceneBase64 = "data:image/png;base64," + sceneBase64;
			}  
			
			if(!isValidBase64(sceneBase64)){
				System.out.println("INVALID SCENE BASE64 OR FAILED TO GENERATE SCENE IMAGE, SKIP THE GENERATE 3D SCENE STEPS!");
				return -1;
			} 

			processFilenameAndGenerate(strFullFileName,input_image_base64,sceneBase64,htmlFilePath,strPrompt);
			 
			return 0;

		}catch(Exception e) {
			System.out.println("ERROR in generateImagesAnd3DScene:" + e.toString());
			return result;
		}
	}

	/**
     * Checks if a string is valid standard Base64 encoding.
     *
     * @param input The string to validate
     * @return true if valid, false otherwise
     */
    
	public static boolean isValidBase64(String input) {
		if (input == null || input.trim().isEmpty()) {
			System.out.println("isValidBase64, Invalid: input is null or empty");
			return false;
		}

		try {
			// Remove whitespace
			String base64 = input.trim().replaceAll("\\s+", "");

			// Remove Data URL prefix if present
			if (base64.startsWith("data:")) {
				int commaIndex = base64.indexOf(',');

				if (commaIndex == -1) {
					return false;
				}

				String metadata = base64.substring(0, commaIndex);

				if (!metadata.contains(";base64")) {
					return false;
				}

				base64 = base64.substring(commaIndex + 1);
			}

			if (base64.isEmpty()) {
				return false;
			}

			// Decode Base64
			java.util.Base64.getDecoder().decode(base64);

			System.out.println("isValidBase64, Valid Base64!");
			return true;

		} catch (IllegalArgumentException e) {
			System.out.println("isValidBase64, Invalid Base64: " + e.getMessage());
			return false;
		}
	}


	private static String generateSceneImage(String strFullFileName,String input_image_base64){
		// int iResultCode = 0;

		String imageBase64="";

		try{

			    AmazonS3 s3Client = AmazonS3ClientBuilder.defaultClient();

			    ResponseHeaderOverrides headerOverrides = new ResponseHeaderOverrides()
						.withContentType("text/plain")
						.withCacheControl("No-cache")
						.withContentDisposition("attachment; filename=temp.txt");
				GetObjectRequest getObjectRequestHeaderOverride = new GetObjectRequest(BUCKET_NAME, strFullFileName)
						.withResponseHeaders(headerOverrides);
				S3Object headerOverrideObject = s3Client.getObject(getObjectRequestHeaderOverride);

				byte[] bytesFile = IOUtils.toByteArray(headerOverrideObject.getObjectContent());
				String strTextFileContent = new String(bytesFile, StandardCharsets.UTF_8);
				String strPromptText = StringUtils.normalizeSpace(strTextFileContent);

				FilterWords blacklistFilter = getFilterListFromS3(MagicStudioHandler.BLACKLIST_NAME);
				ArrayList<String> blackList = blacklistFilter.getWordList();
				String blacklistString = blacklistFilter.getWordsString();
				 
				ArrayList<String> whiteList = loadListFromS3(MagicStudioHandler.WHITELIST_NAME); 
				
				String strWhitelistPrompt = replaceBlacklistWord(strPromptText, blackList, whiteList, blacklistString);

				String sceneFileName = getOutputFileName(strFullFileName,"scene");
			 
				String strScenePrompt = "Transform the attached reference image to a beautiful image describe as following: " + strWhitelistPrompt + ". Make sure the foreground image is the same as the reference iamge and blend naturally, beautiful and seamless with the new background. Beautiful color grading, light and super quality, super resolution image.";
				strScenePrompt = "Change the attached reference image to a beautiful image describe as following: create a beautiful image with the foreground image in this photo, " + strWhitelistPrompt + " .Make sure the foreground image is the same as the reference iamge and blend naturally, beautiful and seamless with the new background. Beautiful color grading, light and super quality, super resolution image.";
				strScenePrompt = "Change the background of the attached reference image as following: " + strWhitelistPrompt + ". Beautiful color grading, light and super quality, super resolution image.";
				
				imageBase64 = generate_multi_angles_image(input_image_base64, sceneFileName, strScenePrompt);
				return imageBase64;

		}catch(Exception e){
			return "error in generateSceneImage";
		} 

	}

	private static String replaceBlacklistWord(String strTextFileContent, ArrayList<String> blackList,
			ArrayList<String> whiteList, String blacklistString) {
		// if not valid ASCII word then return defaul word. To minimum other languages
		// abused bad words.
		// should use an API to check valid English sentence here in future.
		// if(strTextFileContent.matches("^[a-zA-Z\\s]*((\")*[a-zA-Z0-9\\s]*[;,-]*(')*(\")*[a-zA-Z\\s]*[a-zA-Z0-9\\s][;,-]*)*$")
		// == false){
		// if(strTextFileContent.matches("^[a-zA-Z\\s]*((\")*[a-zA-Z0-9\\s]*[;,-]*(')*(\")*[a-zA-Z\\s]*[0-9a-zA-Z\\s]*[a-zA-Z0-9\\s]*[;,-]*)*$")
		// == false){
		// ^[a-zA-Z0-9$@$!%*?&#^-_., +]*$
		String cleansedString = StringUtils.normalizeSpace(strTextFileContent);
		cleansedString = cleansedString.replace("‘", "'");
		cleansedString = cleansedString.replace("’", "'");
		if (cleansedString.matches("^[a-zA-Z0-9/'-:$@$!%?&#^\\-_., +\"]*") == false) {
			System.out.println("28/10/2026: Not valid EN sentence:" + cleansedString);
			return "beautiful e-commerce photo";
		}
		 
		// load the blacklist and whitelist files here, load the list into ArrayList
		ArrayList<String> inputWordList = null;// new ArrayList<String>(); 

		// load input word list, split by comma, space
		 
		cleansedString = cleansedString.replaceAll("[\"]", "\'");
 
		inputWordList = new ArrayList<String>(Arrays.asList(cleansedString.split(" ")));
		 
		StringBuffer strBuffer = new StringBuffer("");
		for (String checkInputWord : inputWordList) {
			int index = -1;
			String strReplace = checkInputWord.trim();
			strReplace = strReplace.toLowerCase();
			// System.out.println("checkInputWord v2=" + strReplace);
			index = blackList.indexOf(strReplace);
			if (index > 0) {
				// if found in blacklist then take the whitelist index to replace the original
				// input word
				if (index >= whiteList.size()) {
					index = 1;
				}
				strReplace = whiteList.get(index);
			}
		 
			strBuffer.append(strReplace);
			strBuffer.append(" ");// can be StringBuffer for performance here
		}
		return strBuffer.toString();
	}// end replaceBlacklistWord()


	private static String loadTextAsStringFromS3(String strFileName) { 
	 
		final AmazonS3 s3 = AmazonS3ClientBuilder.standard()
				.withCredentials(new AWSStaticCredentialsProvider(MagicStudioHandler.credentials))
				.withRegion(Regions.US_EAST_1).build();

		String str = "";
		try { 
			S3Object o = s3.getObject(MagicStudioHandler.BUCKET_NAME, strFileName);
			S3ObjectInputStream s3is = o.getObjectContent();
			// FileOutputStream fos = new FileOutputStream(new File(key_name));
			byte[] read_buf = new byte[1024000];// 1MB
			int read_len = 0;
			s3is.read(read_buf);
			// byte[] to string
			str = new String(read_buf, StandardCharsets.UTF_8);

			s3is.close();
			// fos.close();

		} catch (AmazonServiceException e) {
			System.err.println(e.getErrorMessage());

		} catch (FileNotFoundException e) {
			System.err.println(e.getMessage());

		} catch (IOException e) {
			System.err.println(e.getMessage());

		}

		return str;
	}// end loadStringFromS3


	private static ArrayList<String> loadListFromS3(String strFileName) {
		// ArrayList<String> resultList = new ArrayList<String> ();
		// load the txt file from S3 into ArrayList
		String str = loadTextAsStringFromS3(strFileName);
		str = str.replaceAll("[\n\t]", "");
		ArrayList<String> resultList = new ArrayList<String>(Arrays.asList(str.split("\\s*;\\s*")));

		return resultList;
	}// end loadListFromS3

	private static FilterWords getFilterListFromS3(String strFileName) {
		// ArrayList<String> resultList = new ArrayList<String> ();
		// load the txt file from S3 into ArrayList
		String str = loadTextAsStringFromS3(strFileName);
		str = str.replaceAll("[\n\t]", "");
		ArrayList<String> resultList = new ArrayList<String>(Arrays.asList(str.split("\\s*;\\s*")));

		FilterWords filterWords = new FilterWords(resultList, str.toLowerCase());

		return filterWords;
	}// end getFilterListFromS3

	/**
     * Function that generates the 3D scene asset/model.
     * Returns an integer status code.
     */
    public static int generate3DScene(String strPrompt, String inputImageBase64,String htmlFilePath) {
        System.out.println("-> Processing 3D Scene...");
        System.out.println("   Scene Prompt: \"" + strPrompt + "\""); 
		
		String MUSE_URL = "https://api.meta.ai/v1/responses";
		String MUSE_API_KEY = "YOUR KEY";  

		String API_URL = MODAL_URL;
		String API_KEY = MODAL_API_KEY;
		int iRandom = 1; //1 = MODAL ; 2 = META;   
        
        try {
            CloseableHttpClient client = HttpClients.createDefault();
			int statusCode = 0;
			// String strPrompt ="Rebuild the image as a high quality, realistic 3D scene, including whatever in the background. Return one self-contained index.html that loads Three.js from a CDN with an import map, models the product foregeound image in scene with super realistic using realistic environment map, HDR, tone mapping, Physically Based Rendering (PBR), proper lighting calculations, shadow maps, and post-processing. Matches the colors from the photo, uses soft studio lighting on beautiful background, and slowly turns the product around. Return only the HTML file in a single code block.";

			String jsonRequest_MODAL = "{\n" + //
								"  \"model\": \"meta-models/Muse-Spark-Open-816B-A42B\",\n" + //
								"  \"messages\": [\n" + //
								"      {\n" + // 
								"        \"role\": \"system\",\n" + //
								"        \"content\": \"You are an expert WebGL 3D and threejs senior developer. Your task is to generate a highly realistic 3D threejs scene based on the attached image.\"\n" + //
								"      },\n" + //
								"      {\n" + //
								"      \"role\": \"user\",\n" + //
								"      \"content\": [\n" + //
								"        {\n" + //
								"          \"type\": \"image_url\",\n" + //
								"          \"image_url\": {\n" + //
								"            \"url\": \"$base64\"\n" + //
								"          }\n" + //
								"        },\n" + //
								"        {\n" + //
								"          \"type\": \"text\",\n" + //
								"          \"text\": \"$prompt\"\n" + //
								"        }\n" + //
								"      ]\n" + //
								"    }\n" + //
								"  ],\n" + //
								"  \"temperature\": 1,\n" + //
								"  \"max_tokens\": 86868,\n" + //
								"  \"stream\": false,\n" + //
								"  \"reasoning_effort\": \"medium\"\n" + //
								"}"; 

			String jsonRequest_MUSE = "{\n" + //
								"  \"model\": \"muse-spark-1.3-contributor\",\n" + //
								"  \"input\": [\n" + //
								"    {\n" + //
								"      \"role\": \"user\",\n" + //
								"      \"content\": [\n" + //
								"        {\n" + //
								"          \"type\": \"input_text\",\n" + //
								"          \"text\": \"$prompt\"\n" + //
								"        },\n" + //
								"        {\n" + //
								"          \"type\": \"input_image\",\n" + //
								// 
								"          \"image_url\": \"$base64\"\n" + //
								// "          \"image_url\": \"$image_url\"\n" + //
								"        }\n" + //
								"      ]\n" + // end content part
								"    }\n" + //
								"  ],\n" + //
								"  \"stream\": false,\n" + //
								"  \"temperature\": 1,\n" + //
								"  \"max_output_tokens\": 86868,\n" + //
								"  \"top_p\": 1,\n" + //
								"  \"reasoning\": {\n" + //
								"    \"effort\": \"medium\"\n" + //
								"  }\n" + //
								"}"; 

			String jsonRequest = jsonRequest_MODAL;

			String endpointName = "MODAL";

			if(iRandom == 1){
				jsonRequest = jsonRequest_MODAL;
				API_URL = MODAL_URL;
				API_KEY = MODAL_API_KEY;
				endpointName = "MODAL";
				System.out.println("Sending request to MODAL IN PROGRESS...");
			}
		 

		    jsonRequest = jsonRequest.replace("$prompt", strPrompt);
			jsonRequest = jsonRequest.replace("$base64", inputImageBase64); 

			HttpPost httpPost = new HttpPost(API_URL); 
			StringEntity entity = new StringEntity(jsonRequest, ContentType.APPLICATION_FORM_URLENCODED);
			httpPost.setEntity(entity);
			
			httpPost.setHeader("Content-type", "application/json");

			httpPost.setHeader("Authorization", "Bearer " + API_KEY);

			CloseableHttpResponse response = client.execute(httpPost);

			statusCode = response.getStatusLine().getStatusCode();

			if (statusCode != 200) {
				System.out.println("Error calling MUSE API from " + endpointName + " - code: " + response);
				return -1;
			}

			HttpEntity response_entity = response.getEntity();
			String jsonData = EntityUtils.toString(response_entity);

			if(endpointName .equals("MODAL")){ 

				String extractedText = parseModalRespone(jsonData);
				extractedText = extractedText.replace("```html","");

				extractedText = extractedText.replace("```",""); 

				WriteHTMLToS3(extractedText,htmlFilePath,null,false);
			 
                return 0;
			} 

			if(endpointName.equals("META")){
				String extractedText = parseMetaRespone(jsonData); 
				WriteHTMLToS3(extractedText,htmlFilePath,null,false);
                return 0;
			} 
			 
	    }

        catch (Exception e) {
             e.printStackTrace();
			 Thread.currentThread().interrupt();
        }
        
        return 200;
    }

	 public static String parseModalRespone(String jsonResponse) {
        try {
            JsonObject root = JsonParser.parseString(jsonResponse).getAsJsonObject();
            
            String jsonResponseText = root.getAsJsonArray("choices")
                       .get(0).getAsJsonObject()
                       .getAsJsonObject("message")
                       .get("content")
                       .getAsString();


		   	jsonResponseText = jsonResponseText.replace("```html","");

			jsonResponseText = jsonResponseText.replace("```","");

			return jsonResponseText;
                       
        } catch (Exception e) {
            System.err.println("Failed to parse JSON response: " + e.getMessage());
			System.err.println("The json that caused the error:" + jsonResponse);
        }
        return null;
    }

	 public static String parseMetaRespone(String jsonResponse) {
        try {
            // Parse the root JSON string into a JsonObject
            JsonObject rootObject = JsonParser.parseString(jsonResponse).getAsJsonObject();

            // 1. Navigate to the "output" array
            JsonArray outputArray = rootObject.getAsJsonArray("output");
            if (outputArray != null) {
                // 2. Iterate through output items to find the one with type "message"
                for (JsonElement outputElement : outputArray) {
                    JsonObject outputItem = outputElement.getAsJsonObject();
                    if (outputItem.has("type") && "message".equals(outputItem.get("type").getAsString())) {
                        
                        // 3. Navigate to the "content" array inside the message
                        JsonArray contentArray = outputItem.getAsJsonArray("content");
                        if (contentArray != null) {
                            
                            // 4. Iterate through content items to find the one with type "output_text"
                            for (JsonElement contentElement : contentArray) {
                                JsonObject contentItem = contentElement.getAsJsonObject();
                                if (contentItem.has("type") && "output_text".equals(contentItem.get("type").getAsString())) {
                                    
                                    // 5. Extract the "text" field
                                    String extractedText = contentItem.get("text").getAsString();
									extractedText = extractedText.replace("```html","");

									extractedText = extractedText.replace("```","");

									return extractedText;
                                }
                            }
                        }
                    }
                }
            }
                       
        } catch (Exception e) {
            System.err.println("Failed to parse JSON response: " + e.getMessage());
        }
        return null;
    }



	private static String getOutputFileName(String inputFilename, String keyword) {
    // 1. Separate directory path from the filename itself
    int lastSlashIdx = inputFilename.lastIndexOf('/');
    String dirPath = "";
    String filenameOnly = inputFilename;

    if (lastSlashIdx != -1) {
        dirPath = inputFilename.substring(0, lastSlashIdx + 1); // Includes the trailing slash
        filenameOnly = inputFilename.substring(lastSlashIdx + 1);
    }

    // Define all known angle keywords to strip out existing ones
    String[] allKeywords = {"front", "left", "right", "back", "scene"};

    // 2. Parse extension and split base name by hyphens
    int dotIdx = filenameOnly.lastIndexOf('.');
    String ext = ".png";
    String baseWithoutExt = filenameOnly;
    if (dotIdx != -1) {
        ext = filenameOnly.substring(dotIdx);
        baseWithoutExt = filenameOnly.substring(0, dotIdx);
    }

    String[] parts = baseWithoutExt.split("-");

    // 3. Find the first known angle keyword index
    int firstKeywordIdx = -1;
    for (int i = 0; i < parts.length; i++) {
        for (String kw : allKeywords) {
            if (parts[i].equalsIgnoreCase(kw)) {
                firstKeywordIdx = i;
                break;
            }
        }
        if (firstKeywordIdx != -1) break;
    }

    // 4. Extract prefix and suffix (hash) robustly
    String prefix = "";
    String suffix = "";

    if (firstKeywordIdx != -1) {
        // Prefix is everything before the first keyword
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < firstKeywordIdx; i++) {
            if (sb.length() > 0) sb.append("-");
            sb.append(parts[i]);
        }
        prefix = sb.toString();
    } else {
        // No angle keyword found in filename (e.g., "magic3dstudio-1793284732663-u58geccmu94q8gtn.png")
        if (parts.length > 1) {
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < parts.length - 1; i++) {
                if (sb.length() > 0) sb.append("-");
                sb.append(parts[i]);
            }
            prefix = sb.toString();
        } else {
            prefix = baseWithoutExt;
        }
    }

    // Suffix is the last part (hash/token) + extension
    if (parts.length > 0) {
        suffix = parts[parts.length - 1] + ext;
    } else {
        suffix = ext;
    }

    // 5. Construct and return the full output file path
    String strResult = dirPath + prefix + "-" + keyword + "-" + suffix;
    strResult = strResult.replace(".txt", ".png");
    
    return strResult;
}

    /**
     * Parses the filename containing directory paths, extracts present angle keywords, 
     * and concurrently executes both multi-angle image generation and 3D scene generation.
     */
    public static void processFilenameAndGenerate(String inputFilename, String inputImageBase64, String sceneBase64, String htmlFilePath, String str3DPrompt) {
    
	//0. Make sure we proceed the .png file name and not the .txt which trigger the Lambda function
	String textInputFileName = inputFilename;

	inputFilename = inputFilename.replace(".txt",".png");

	// 1. Separate directory path from the filename itself
    int lastSlashIdx = inputFilename.lastIndexOf('/');
    String dirPath = "";
    String filenameOnly = inputFilename;

    if (lastSlashIdx != -1) {
        dirPath = inputFilename.substring(0, lastSlashIdx + 1); // Includes the trailing slash
        filenameOnly = inputFilename.substring(lastSlashIdx + 1);
    }

    String[] targetKeywords = {"front", "left", "right", "back", "scene"};

    // 2. Parse extension, prefix, and suffix (hash) robustly using hyphen splitting
    int dotIdx = filenameOnly.lastIndexOf('.');
    String ext = ".png";
    String baseWithoutExt = filenameOnly;
    if (dotIdx != -1) {
        ext = filenameOnly.substring(dotIdx);
        baseWithoutExt = filenameOnly.substring(0, dotIdx);
    }

    String[] parts = baseWithoutExt.split("-");

    int firstKeywordIdx = -1;
    for (int i = 0; i < parts.length; i++) {
        for (String kw : targetKeywords) {
            if (parts[i].equalsIgnoreCase(kw)) {
                firstKeywordIdx = i;
                break;
            }
        }
        if (firstKeywordIdx != -1) break;
    }

    String prefix = "";
    String suffix = "";

    if (firstKeywordIdx != -1) {
        // Prefix is everything before the first keyword
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < firstKeywordIdx; i++) {
            if (sb.length() > 0) sb.append("-");
            sb.append(parts[i]);
        }
        prefix = sb.toString();

        // Suffix is the last part (hash) + extension
        if (parts.length > 0) {
            suffix = parts[parts.length - 1] + ext;
        } else {
            suffix = ext;
        }
    } else {
        // No angle keyword found in filename (e.g., "magic3dstudio-1793284732663-u58geccmu94q8gtn.png")
        if (parts.length > 1) {
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < parts.length - 1; i++) {
                if (sb.length() > 0) sb.append("-");
                sb.append(parts[i]);
            }
            prefix = sb.toString();
            suffix = parts[parts.length - 1] + ext;
        } else {
            prefix = baseWithoutExt;
            suffix = ext;
        }
    }

    // 3. Check which angle keywords are present in the filename
    List<String> presentKeywords = new ArrayList<>();
    for (String kw : targetKeywords) {
        boolean found = false;
        for (String p : parts) {
            if (p.equalsIgnoreCase(kw)) {
                found = true;
                break;
            }
        }
        if (found) {
            presentKeywords.add(kw);
        }
    }

    // If no keywords are present in the filename, default to processing all target keywords
    if (presentKeywords.isEmpty()) {
        presentKeywords.addAll(Arrays.asList(targetKeywords));
    } 

    // List to keep track of all concurrent worker threads
    List<Thread> activeThreads = new ArrayList<>();

    // 4. Spawn threads for multi-angle image generation (preserving directory path)
    for (String angle : presentKeywords) {
        String outputImageName = dirPath + prefix + "-" + angle + "-" + suffix;
        String creativePrompt = "";
        if (angle.equals("scene")) {
            creativePrompt = "edit the reference image, transform the background as following: " + creativePrompt;
            continue; // skip generate scene image because we already did that before calling multi angles
        } else {
            creativePrompt = "generate a " + angle + " side image from the reference product image";
        }
        String inputPrompt = creativePrompt;

        Thread angleThread = new Thread(() -> {
            String base64 = generate_multi_angles_image(inputImageBase64, outputImageName, inputPrompt);
            System.out.println("✔ Completed Angle [" + angle + "]");
        });

        activeThreads.add(angleThread);
        angleThread.start();
    }

    // 5. Spawn a concurrent thread for generate3DScene
	String strUserPrompt = fetchTextFileContent(textInputFileName);

    Thread sceneThread = new Thread(() -> { 
		if (!MagicStudioHandler.isValidBase64(sceneBase64)){
			 System.err.println("Thread interrupted: invalid scene image base64, skip generate3DScene_Agents_AlphaTeam!");
			 Thread.currentThread().interrupt();
		}else{
			int status = generate3DScene_Agents_AlphaTeam(str3DPrompt,strUserPrompt, sceneBase64, htmlFilePath,textInputFileName);
		}
    });

	//Only start the Thread to generate 3D scene if we generated a valid scene image and get it base64 correctly
	if (MagicStudioHandler.isValidBase64(sceneBase64)){
		activeThreads.add(sceneThread);
		sceneThread.start();
	}else{
		System.err.println("Skip Thread to generate 3D Scene: invalid scene image base64, skip generate3DScene_Agents_AlphaTeam!");
	}

    // 6. Join and wait for ALL threads (angles + 3D scene) to complete execution
    for (Thread t : activeThreads) {
        try {
            t.join();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            System.err.println("Thread interrupted: " + e.getMessage());
        }
    }

    System.out.println("\nAll concurrent image and 3D scene generation tasks completed successfully.");
    }

	/** Returns the text of an S3 object, e.g. fetchTextFileContent("train.html"). */
	public static String fetchTextFileContent(String fileName){
		String strFileContent = "";

		try{

					AmazonS3 s3Client = AmazonS3ClientBuilder.defaultClient();

					ResponseHeaderOverrides headerOverrides = new ResponseHeaderOverrides()
							.withContentType("text/plain")
							.withCacheControl("No-cache")
							.withContentDisposition("attachment; filename=temp.txt");
					GetObjectRequest getObjectRequestHeaderOverride = new GetObjectRequest(MagicStudioHandler.BUCKET_NAME, fileName)
							.withResponseHeaders(headerOverrides);
					S3Object headerOverrideObject = s3Client.getObject(getObjectRequestHeaderOverride);

					S3ObjectInputStream in = headerOverrideObject.getObjectContent();
					strFileContent = new String(in.readAllBytes(), StandardCharsets.UTF_8); 

					return strFileContent;
	}catch(Exception e){
		System.out.println("Error in fetchTextFileContent :" + e.getMessage());
		return "";
	}
	}

	private static int generate3DScene_Agents_AlphaTeam(String prompt, String strUserPrompt,String imageBase64,String outputHtmlFileName,String inputFileName){
		int iResult = 0; 
		 
		SceneResult r = Agents.generate3dScene(imageBase64, strUserPrompt, inputFileName);      // never throws; r.html() is always a usable page
        String htmlContent = r.html();   
		
		String sceneBrief = r.briefJson();
		String outputJsonFileName = outputHtmlFileName.replace(".html",".json");

	    try{ 
			WriteJSONToS3(sceneBrief,outputJsonFileName,null,false); 
			WriteHTMLToS3(htmlContent,outputHtmlFileName,null,false); 
		}catch(Exception e){
			System.out.println("ERROR in generate3DScene_Agents_v1:" + e.getMessage());
		}

		return iResult;
	}

	private static int retouch_Agents_AlphaTeam(String strUserPrompt,String sceneImageBase64,String outputHtmlFileName,String inputFileName){
		int iResult = 0; 
		String inputSceneBriefJsonFileName = "";
  
		// names: the app uploads these next to each other (same key and device)
		//   <key>-4retouch-<device>.txt  .html  .json  .png      <- you already read these
		//   <key>-4retouch-3dsnapshot-<device>.png               <- optional snapshot
		String snapName = inputFileName.replace("-4retouch-", "-4retouch-3dsnapshot-"); 
		snapName = snapName.replace(".txt",".png");

		String previousHtmlName = inputFileName.replace(".txt",".html");

		String previousHtml = null;

		String snapshotBase64 = null;                                        // null = retouch exactly as today
		try {
			snapshotBase64 = ReferenceStore.fetchReferenceImage(snapName);
			if(!isValidBase64(snapshotBase64)){
				snapshotBase64 = null;
			}
			previousHtml = ReferenceStore.fetchReferenceText(previousHtmlName);
			if (previousHtml == null || previousHtml.isBlank()) {
				// do not call retouch3dScene: the retouch inputs are incomplete 
				System.out.println("retouch_Agents_AlphaTeam: the retouch inputs are incomplete, missing previousHtml, skip retouch ");
				return -1;
			}
		} catch (Exception e) {
			System.out.println("retouch without 3D snapshot: " + e.getMessage());     // never fail the retouch because of the snapshot
		}

		SceneResult r = Agents.retouch3dScene(sceneImageBase64, strUserPrompt, previousHtml, null, snapshotBase64);
		// never throws; r.html() is always a usable page; r.notes() says "3D snapshot sent to agent B" or "3D snapshot ignored ..."
 
        String htmlContent = r.html();   
		
		String sceneBrief = r.briefJson();
		String outputJsonFileName = outputHtmlFileName.replace(".html",".json");

	    try{ 
			WriteJSONToS3(sceneBrief,outputJsonFileName,null,false); 
			WriteHTMLToS3(htmlContent,outputHtmlFileName,null,false);  
		}catch(Exception e){
			System.out.println("ERROR in retouch_Agents_AlphaTeam:" + e.getMessage());
		} 
		return iResult;
	}

	/**
     * Function that generates multi-angle images.
     * Returns an integer status code.
     */
    public static String generate_multi_angles_image(String inputImageBase64, String outputImageName, String inputPrompt) {
        System.out.println("-> Processing: " + outputImageName);
        System.out.println("   Prompt for generate_multi_angles_image: \"" + inputPrompt + "\"");

		String imageBase64 = "";

		String META_MUSE_IMAGE_URL = "https://api.meta.ai/v1/responses";
		String META_MUSE_API_KEY = "YOUR KEY";

		String MODAL_URL = "YOUR URL"; 
		String MODAL_API_KEY = "YOUR KEY";
 
		String API_URL = MODAL_URL;
		String API_KEY = MODAL_API_KEY;
		String endpointName = "MODAL";

		int iRandom = 2; //1 = MODAL ; 2 = META; 

		CloseableHttpClient client = HttpClients.createDefault();
		int statusCode = 0;

		String jsonRequest_META = "{\n" + //
						"  \"input\": [\n" + //
						"    {\n" + //
						"      \"content\": [\n" + //
						"        {\n" + //
						"          \"text\": \"$prompt\",\n" + //
						"          \"type\": \"input_text\"\n" + //
						"        },\n" + //
						"        {\n" + //
						"          \"image_url\": \"$base64\",\n" + //
						"          \"type\": \"input_image\"\n" + //
						"        }\n" + //
						"      ],\n" + //
						"      \"role\": \"user\",\n" + //
						"      \"type\": \"message\"\n" + //
						"    }\n" + //
						"  ],\n" + //
						"  \"max_output_tokens\": 2048,\n" + //
						"  \"model\": \"muse-image-1.0\",\n" + //
						"  \"store\": true,\n" + //
						"  \"stream\": false,\n" + //
						"  \"temperature\": 0.6,\n" + //
						"  \"top_p\": 0.9,\n" + //
						"  \"tools\": [\n" + //
						"    {\n" + //
						"      \"enable_image_search\": true,\n" + //
						"      \"enable_shell\": true,\n" + //
						"      \"enable_web_search\": true,\n" + //
						"	   \"size\": \"1024x1024\",\n" + //
						"      \"output_format\": \"png\",\n" + //
						"      \"reasoning_strength\": \"high\",\n" + //
						"      \"type\": \"image_generation\"\n" + //
						"    }\n" + //
						"  ]\n" + //
						"}";


		String jsonRequest_MODAL = jsonRequest_META; 
        
        try { 

		    String jsonRequest = jsonRequest_MODAL;

			if(iRandom == 1){
			 	jsonRequest = jsonRequest_MODAL;
				endpointName = "MODAL";
				API_URL = MODAL_URL;
				API_KEY = MODAL_API_KEY;
			}
			if(iRandom == 2){
			 	jsonRequest = jsonRequest_META;
				endpointName = "META";
				API_URL = META_MUSE_IMAGE_URL;
				API_KEY = META_MUSE_API_KEY;
			} 
			
			jsonRequest.replace("$prompt", inputPrompt);
			jsonRequest = jsonRequest.replace("$base64", inputImageBase64);

			HttpPost httpPost = new HttpPost(API_URL);
			StringEntity entity = new StringEntity(jsonRequest, ContentType.APPLICATION_FORM_URLENCODED);
			httpPost.setEntity(entity);
			
			httpPost.setHeader("Content-type", "application/json"); 
			httpPost.setHeader("Authorization", "Bearer " + API_KEY);

			System.out.print("SENDING IMAGE GENERATION REQUEST TO " + endpointName + " ...");

			CloseableHttpResponse response = client.execute(httpPost);

			statusCode = response.getStatusLine().getStatusCode();

			if (statusCode != 200) {
				System.out.println("Error calling MUSE API from " + endpointName + " - code: " + response);
				return "error in generate_multi_angles_image";
			}

			HttpEntity response_entity = response.getEntity();
			String jsonData = EntityUtils.toString(response_entity);

			if(endpointName.equals("MODAL")){
				System.out.print("RESPONE JSON FROM MODAL:" + jsonData);
			}

			var outputTextFileName = outputImageName.replace(".png",".rxt");
		 
			// 1. Ensure you extract the actual base64 image string from your JSON response 
			// (Replace extractMessageId with the correct JSON extraction method for your image field)
			imageBase64 = extractImageBase64FromJSON(jsonData); 

			if (imageBase64 == null || imageBase64.isEmpty()) {
				System.err.println("Error: generate_multi_angles_image: Image base64 data is null or empty.");
				return "error in generate_multi_angles_image";
			}

			// 2. Safely check and strip data URI scheme header if present
			if (imageBase64.startsWith("data:image")) {
				// Remove the data prefix (e.g., "data:image/png;base64,") so decoder gets pure base64
				imageBase64 = imageBase64.substring(imageBase64.indexOf(",") + 1);
			}

			// 3. Decode the clean Base64 string
			byte[] decodedImageBytes = Base64.decodeBase64(imageBase64); 
			InputStream image_fis = new ByteArrayInputStream(decodedImageBytes);

			System.out.print("NOW STARTING writing MUSE IMAGE to S3: " + outputImageName); 
			WriteImageToS3_AsIs(image_fis, outputImageName);
 
			return imageBase64;

        } catch (Exception e) {
			System.out.print("ERROR IN generate_multi_angles_image: " + e.getMessage());
            Thread.currentThread().interrupt();
        } 
      
        return imageBase64;
    }

	/**
	 * Parses the JSON string and extracts the image base64 data
	 */
	 	/**
     * Extracts clean raw base64 data from a raw response string, JSON string, or data URI.
     * 
     * @param response The raw response string or JSON payload
     * @return Clean base64 string, or null if invalid/empty
     */
    public static String extractImageBase64FromJSON(String response) {

		// Regex to match and capture the payload after a data URI prefix
    	final Pattern DATA_URI_PATTERN = Pattern.compile("^data:image/[a-zA-Z0-9.+-]+;base64,(.*)$");
    
		// Regex to extract the 'result' field value from a JSON string
		final Pattern JSON_RESULT_PATTERN = Pattern.compile("\"result\"\\s*:\\s*\"([^\"]+)\"");

        if (response == null || response.trim().isEmpty()) {
            return null;
        }

        String target = response.trim();

        // 1. If it's a JSON string, extract the 'result' field if present
        if (target.startsWith("{")) {
            Matcher jsonMatcher = JSON_RESULT_PATTERN.matcher(target);
            if (jsonMatcher.find()) {
                target = jsonMatcher.group(1);
            }
        }

        // 2. Strip out the data URI prefix if present
        Matcher uriMatcher = DATA_URI_PATTERN.matcher(target);
        if (uriMatcher.matches()) {
            target = uriMatcher.group(1);
        } else if (target.startsWith("data:image/")) {
            int commaIndex = target.indexOf(',');
            if (commaIndex != -1) {
                target = target.substring(commaIndex + 1);
            }
        }

        return target;
    }

	public static void WriteImageToS3_AsIs(InputStream generatedFile, String destinationFile)
			throws IOException {

		InputStream imageFileStream = new ByteArrayInputStream(generatedFile.readAllBytes()); 
		AmazonS3 s3Client = AmazonS3ClientBuilder.defaultClient();

		int size = imageFileStream.available();

		System.out.println("Writing MUSE Image, size = " + size);

		// Set Content-Length and Content-Type
		ObjectMetadata meta = new ObjectMetadata();
		meta.setContentLength(size);
		meta.setContentType(MagicStudioHandler.PNG_MIME); 

		try {
			PutObjectRequest request = new PutObjectRequest(MagicStudioHandler.BUCKET_OUT, destinationFile,
					imageFileStream, meta); 
		 
			s3Client.putObject(request); 
			 
		} catch (AmazonServiceException e) {
			System.out.println(e.getErrorMessage());
			System.exit(1);
		}
	} 

	private static void WriteHTMLToS3(String strHTML, String destinationFile, InputStream input_htmlFileStream,
			boolean isUseInputStream) throws IOException {
		InputStream imageFileStream;

		if (isUseInputStream) { 
			imageFileStream = input_htmlFileStream;
		} else { 
			imageFileStream = new ByteArrayInputStream(strHTML.getBytes());
		}

		// REM using global g_s3Client
		AmazonS3 s3Client = AmazonS3ClientBuilder.defaultClient();

		int size = imageFileStream.available();
		// Set Content-Length and Content-Type
		ObjectMetadata meta = new ObjectMetadata();
		meta.setContentLength(size);
		meta.setContentType("text/html");

		PutObjectRequest request = new PutObjectRequest(MagicStudioHandler.BUCKET_OUT, destinationFile,
				imageFileStream, meta);
	 
		s3Client.putObject(request);

		imageFileStream.close();
		imageFileStream = null;

	}

	private static void WriteJSONToS3(String strHTML, String destinationFile, InputStream input_htmlFileStream,
			boolean isUseInputStream) throws IOException {
		InputStream imageFileStream;

		if (isUseInputStream) { 
			imageFileStream = input_htmlFileStream;
		} else { 
			imageFileStream = new ByteArrayInputStream(strHTML.getBytes());
		} 

		AmazonS3 s3Client = AmazonS3ClientBuilder.defaultClient();

		int size = imageFileStream.available();
		// Set Content-Length and Content-Type
		ObjectMetadata meta = new ObjectMetadata();
		meta.setContentLength(size);
		meta.setContentType("application/json");

		PutObjectRequest request = new PutObjectRequest(MagicStudioHandler.BUCKET_OUT, destinationFile,
				imageFileStream, meta);
	 
		s3Client.putObject(request);

		imageFileStream.close();
		imageFileStream = null;

	} 

	public static void WriteTxtToS3(String strContent, String destinationFile, InputStream input_textFileStream,
			boolean isUseInputStream) throws IOException {
		InputStream imageFileStream;

		if (isUseInputStream) {
			System.out.println("using Text inputStream...");
			imageFileStream = input_textFileStream;
		} else {
			System.out.println("using HTML string...");
			imageFileStream = new ByteArrayInputStream(strContent.getBytes());
		} 

		AmazonS3 s3Client = AmazonS3ClientBuilder.defaultClient();

		int size = imageFileStream.available();
		 
		ObjectMetadata meta = new ObjectMetadata();
		meta.setContentLength(size);
		meta.setContentType("text/plain");

		PutObjectRequest request = new PutObjectRequest(MagicStudioHandler.BUCKET_OUT, destinationFile,
				imageFileStream, meta); 
		s3Client.putObject(request);

		imageFileStream.close();
		imageFileStream = null;

	}

	//END MAGIC STUDIO
 
  