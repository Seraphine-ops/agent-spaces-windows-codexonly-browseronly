using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System.Runtime.InteropServices;
using System.Text.Json;

static class Program {
 [STAThread] static void Main(string[] args) {
  if(args.Length==1&&args[0]=="--check-runtime"){
   try{Console.WriteLine(CoreWebView2Environment.GetAvailableBrowserVersionString());Environment.ExitCode=0;}
   catch{Console.Error.WriteLine("Microsoft Edge WebView2 Evergreen runtime is required.");Environment.ExitCode=1;}
   return;
  }
  ApplicationConfiguration.Initialize();Application.Run(new Host(args));
 }
}
sealed class TabWindow : Form { protected override bool ShowWithoutActivation => true; }
sealed class Tab {
 public required Form Window; public required WebView2 View; public bool Loading; public bool Manual; public bool Connected; public string? Error;
}
sealed class Host : Form {
 protected override bool ShowWithoutActivation => true;
 readonly Dictionary<string,Tab> tabs=new(); readonly string profile,downloads; readonly IntPtr parent; CoreWebView2Environment? env; readonly object outputLock=new();
 [DllImport("user32.dll")] static extern IntPtr SetParent(IntPtr child,IntPtr parent);
 [DllImport("user32.dll",EntryPoint="GetWindowLongW")] static extern int GetStyle(IntPtr hwnd,int index);
 [DllImport("user32.dll",EntryPoint="SetWindowLongW")] static extern int SetStyle(IntPtr hwnd,int index,int value);
 [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr hwnd,IntPtr after,int x,int y,int w,int h,uint flags);
 [DllImport("user32.dll")] static extern bool EnableWindow(IntPtr hwnd,bool enabled);
 [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr hwnd);
 public Host(string[] args) {
  parent=new IntPtr(long.Parse(args[0]));profile=args[1];downloads=args[2];ShowInTaskbar=false;Opacity=0;Width=1;Height=1;
  Shown+=async(_,_)=>{Hide();try{env=await CoreWebView2Environment.CreateAsync(userDataFolder:profile);Send(new {ready=true});_=Task.Run(ReadCommands);}catch(Exception e){Send(new {fatal=e.Message});Application.Exit();}};
 }
 void Send(object value){lock(outputLock){Console.WriteLine(JsonSerializer.Serialize(value));Console.Out.Flush();}}
 // Only endpoint categories and status metadata leave WebView2. Never log headers,
 // bodies, query strings, fragments, arbitrary paths, or exception messages.
 static string Endpoint(string url){
  if(!Uri.TryCreate(url,UriKind.Absolute,out var u)||(u.Scheme!="https"&&u.Scheme!="http"))return "other";
  var allowed=new HashSet<string>{"mfa-challenge","log-in","login","authorize","callback","oauth","token","auth","api","accounts","session","sessions","en","signup","join","account_verifications","password_reset"};
  var parts=u.AbsolutePath.Split('/',StringSplitOptions.RemoveEmptyEntries).Select(p=>allowed.Contains(p)?p:"[redacted]");
  return u.GetLeftPart(UriPartial.Authority)+"/"+string.Join("/",parts);
 }
 void Diagnostic(string id,string kind,object details){
  try{var file=Path.Combine(Path.GetDirectoryName(profile)!,"login-diagnostics.jsonl");lock(outputLock){
   if(File.Exists(file)&&new FileInfo(file).Length>2_000_000)File.Move(file,file+".previous",true);
   File.AppendAllText(file,JsonSerializer.Serialize(new {at=DateTimeOffset.UtcNow,tab=id,kind,details})+Environment.NewLine);
  }}catch{/* Diagnostics must never interrupt browsing. */}
 }
 void Observe(string id,Tab t){var core=t.View.CoreWebView2;
  core.NavigationStarting+=(_,e)=>Diagnostic(id,"navigation-start",new {endpoint=Endpoint(e.Uri),navigation=e.NavigationId,redirect=e.IsRedirected});
  core.NavigationCompleted+=(_,e)=>Diagnostic(id,"navigation-complete",new {navigation=e.NavigationId,success=e.IsSuccess,status=e.HttpStatusCode,error=e.WebErrorStatus.ToString()});
  core.DOMContentLoaded+=(_,e)=>Diagnostic(id,"dom-ready",new {navigation=e.NavigationId});
  core.NewWindowRequested+=(_,e)=>Diagnostic(id,"popup",new {endpoint=Endpoint(e.Uri)});
  core.ProcessFailed+=(_,e)=>Diagnostic(id,"process-failed",new {kind=e.ProcessFailedKind.ToString()});
  core.WebResourceResponseReceived+=(_,e)=>{
   if(Uri.TryCreate(e.Request.Uri,UriKind.Absolute,out var u)&&(u.Host=="openai.com"||u.Host.EndsWith(".openai.com")||u.Host=="chatgpt.com"||u.Host.EndsWith(".chatgpt.com")||u.Host=="github.com"||u.Host=="octocaptcha.com"||u.IsLoopback))
    Diagnostic(id,"response",new {endpoint=Endpoint(e.Request.Uri),status=e.Response.StatusCode});
  };
  Diagnostic(id,"attached",new {runtime=core.Environment.BrowserVersionString});
 }
 async Task ReadCommands(){string? line;while((line=await Console.In.ReadLineAsync())!=null){try{var a=JsonDocument.Parse(line).RootElement.Clone();BeginInvoke(new Action(async()=>{var id=a.GetProperty("requestId").GetInt32();try{var result=await Act(a);Send(new {requestId=id,result});}catch(Exception e){Send(new {requestId=id,error=e.Message});}}));}catch{}}BeginInvoke(new Action(()=>Application.Exit()));}
 static string S(JsonElement a,string key,string fallback="")=>a.TryGetProperty(key,out var v)?v.GetString()??fallback:fallback;
 static bool B(JsonElement a,string key)=>a.TryGetProperty(key,out var v)&&v.GetBoolean();
 static double N(JsonElement a,string key)=>a.GetProperty(key).GetDouble();
 static bool Allowed(string url)=>url=="about:blank"||(Uri.TryCreate(url,UriKind.Absolute,out var u)&&(u.Scheme=="https"||u.Scheme=="http")&&string.IsNullOrEmpty(u.UserInfo));
 object Meta(string id,Tab t)=>new {id,url=t.View.Source?.AbsoluteUri??"about:blank",title=t.View.CoreWebView2.DocumentTitle,loading=t.Loading,back=t.View.CoreWebView2.CanGoBack,forward=t.View.CoreWebView2.CanGoForward,error=t.Error};
 void Changed(string id,Tab t)=>Send(new {change=Meta(id,t)});
 async Task Navigate(Tab t,string url){if(!Allowed(url))throw new Exception("Use an HTTP(S) URL without credentials.");var done=new TaskCompletionSource();void Complete(object? s,CoreWebView2NavigationCompletedEventArgs e){if(e.IsSuccess)done.TrySetResult();else done.TrySetException(new Exception("Navigation failed: "+e.WebErrorStatus));}t.View.CoreWebView2.NavigationCompleted+=Complete;try{t.View.CoreWebView2.Navigate(url);await done.Task.WaitAsync(TimeSpan.FromSeconds(45));}finally{t.View.CoreWebView2.NavigationCompleted-=Complete;}}
 async Task<string> Eval(Tab t,string expression){var result=await t.View.CoreWebView2.CallDevToolsProtocolMethodAsync("Page.createIsolatedWorld","{\"frameId\":"+JsonSerializer.Serialize((await Frame(t)))+",\"worldName\":\"agent-spaces\"}");var ctx=JsonDocument.Parse(result).RootElement.GetProperty("executionContextId").GetInt32();var json=await t.View.CoreWebView2.CallDevToolsProtocolMethodAsync("Runtime.evaluate",JsonSerializer.Serialize(new {expression,contextId=ctx,returnByValue=true,awaitPromise=true}));var root=JsonDocument.Parse(json).RootElement;if(root.TryGetProperty("exceptionDetails",out var ex))throw new Exception(ex.TryGetProperty("exception",out var err)&&err.TryGetProperty("description",out var desc)?desc.GetString():"Page script failed");var r=root.GetProperty("result");return r.TryGetProperty("value",out var val)?val.GetRawText():"null";}
 async Task<string> Frame(Tab t){var json=await t.View.CoreWebView2.CallDevToolsProtocolMethodAsync("Page.getFrameTree","{}");return JsonDocument.Parse(json).RootElement.GetProperty("frameTree").GetProperty("frame").GetProperty("id").GetString()!;}
 async Task Connect(Tab t){if(t.Manual)throw new Exception("Human control is active. Wait for the user to resume.");if(!t.Connected){await t.View.CoreWebView2.CallDevToolsProtocolMethodAsync("Emulation.setFocusEmulationEnabled","{\"enabled\":true}");t.Connected=true;}}
 async Task<object> Act(JsonElement a){
  var op=S(a,"op");var id=S(a,"id");
  if(op=="create"){
   if(tabs.ContainsKey(id))throw new Exception("Tab already exists");
   var window=new TabWindow{FormBorderStyle=FormBorderStyle.None,ShowInTaskbar=false,Width=1100,Height=800,AutoScaleMode=AutoScaleMode.None};var view=new WebView2{Dock=DockStyle.Fill};window.Controls.Add(view);window.Show();SetStyle(window.Handle,-16,(GetStyle(window.Handle,-16)&unchecked((int)~0x80000000))|0x40000000);SetParent(window.Handle,parent);SetWindowPos(window.Handle,IntPtr.Zero,-30000,0,1100,800,0x0010);
   var t=new Tab{Window=window,View=view};tabs[id]=t;
   try{await view.EnsureCoreWebView2Async(env);view.CoreWebView2.PermissionRequested+=(_,e)=>e.State=CoreWebView2PermissionState.Deny;view.CoreWebView2.DownloadStarting+=(_,e)=>e.ResultFilePath=Path.Combine(downloads,DateTimeOffset.Now.ToUnixTimeMilliseconds()+"-"+Path.GetFileName(e.ResultFilePath));
    Observe(id,t);
    // Dedicated transient channel. Never send credentials to Diagnostic or
    // arbitrary RPC responses; the parent validates origin and success state.
    view.CoreWebView2.WebMessageReceived+=(_,e)=>{
     try{var message=JsonDocument.Parse(e.WebMessageAsJson).RootElement;
      if(message.TryGetProperty("agentSpacesCredential",out var observation)&&e.WebMessageAsJson.Length<24000)
       Send(new {credential=new {id,source=e.Source,observation=observation.Clone()}});
     }catch{/* Untrusted page messages cannot interrupt browsing. */}
    };
    var credentialScript=S(a,"credentialScript");
    if(credentialScript.Length>0)await view.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(credentialScript);
    view.CoreWebView2.NewWindowRequested+=(_,e)=>{e.Handled=true;if(Allowed(e.Uri))Send(new {popup=new {id,url=e.Uri}});};
    view.CoreWebView2.NavigationStarting+=(_,e)=>{if(!Allowed(e.Uri)){e.Cancel=true;return;}t.Loading=true;Changed(id,t);};
    view.CoreWebView2.NavigationCompleted+=(_,e)=>{t.Loading=false;Changed(id,t);};view.CoreWebView2.DocumentTitleChanged+=(_,_)=>Changed(id,t);view.CoreWebView2.SourceChanged+=(_,_)=>Changed(id,t);
    try{await Navigate(t,S(a,"url","about:blank"));}catch(Exception e){t.Error=e.Message;}return Meta(id,t);
   }catch{tabs.Remove(id);window.Dispose();throw;}
  }
  if(!tabs.TryGetValue(id,out var tab))throw new Exception("Tab not found");var core=tab.View.CoreWebView2;
  if(op=="layout"){var scale=GetDpiForWindow(parent)/96.0;SetWindowPos(tab.Window.Handle,IntPtr.Zero,(B(a,"visible")?(int)(N(a,"x")*scale):-30000),(int)(N(a,"y")*scale),(int)(N(a,"width")*scale),(int)(N(a,"height")*scale),0x0010);EnableWindow(tab.Window.Handle,B(a,"interactive"));tab.Window.Show();return new {ok=true};}
  if(op=="close"){tabs.Remove(id);tab.Window.Dispose();return new {ok=true};}
  if(op=="suspend"){tab.Manual=true;if(tab.Connected)await core.CallDevToolsProtocolMethodAsync("Emulation.setFocusEmulationEnabled","{\"enabled\":false}");tab.Connected=false;return new {ok=true};}
  if(op=="resume"){tab.Manual=false;return new {ok=true};}
  if(op=="debuggerStatus")return new {attached=tab.Connected,manual=tab.Manual};
  if(op=="screenshot"){await Connect(tab);var shot=JsonDocument.Parse(await core.CallDevToolsProtocolMethodAsync("Page.captureScreenshot","{\"format\":\"png\",\"captureBeyondViewport\":false}"));return new {image=shot.RootElement.GetProperty("data").GetString()};}
  if(op=="preview"){using var stream=new MemoryStream();await core.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,stream).WaitAsync(TimeSpan.FromSeconds(5));return new {image=Convert.ToBase64String(stream.ToArray())};}
  if(op=="loadURL"){await Navigate(tab,S(a,"url"));return Meta(id,tab);}
  if(op=="reload"){core.Reload();return new {ok=true};}if(op=="back"){if(core.CanGoBack)core.GoBack();return new {ok=true};}if(op=="forward"){if(core.CanGoForward)core.GoForward();return new {ok=true};}
  if(op=="manualFill")return JsonSerializer.Deserialize<JsonElement>(await Eval(tab,S(a,"script")));
  await Connect(tab);
  if(op=="navigate"){await Navigate(tab,S(a,"url"));return JsonSerializer.Deserialize<JsonElement>(await Eval(tab,S(a,"snapshotScript")));}
  if(op=="snapshot")return JsonSerializer.Deserialize<JsonElement>(await Eval(tab,S(a,"script")));
  if(op=="click"||op=="fill"){
   var reference=S(a,"ref");double x=0,y=0;if(reference!=""){
    var pos=await Eval(tab,"(()=>{const e=globalThis.agentSpacesRefs?.get("+JsonSerializer.Serialize(reference)+");if(!e?.isConnected)throw Error('Stale element ref. Take another snapshot.');e.scrollIntoView({behavior:'instant',block:'center',inline:'center'});const r=e.getBoundingClientRect();if(!r.width||!r.height)throw Error('Element is hidden');if(e.disabled)throw Error('Element is disabled');return {x:r.x+r.width/2,y:r.y+r.height/2};})()");var point=JsonDocument.Parse(pos).RootElement;x=point.GetProperty("x").GetDouble();y=point.GetProperty("y").GetDouble();
   }else{x=N(a,"x");y=N(a,"y");}
   if(op=="fill"){
    await Eval(tab,"(()=>{const e=globalThis.agentSpacesRefs.get("+JsonSerializer.Serialize(reference)+");if(!e.matches('input,textarea,[contenteditable=true]'))throw Error('Target is not editable');e.focus();if(e.select)e.select();else{const s=getSelection(),r=document.createRange();r.selectNodeContents(e);s.removeAllRanges();s.addRange(r)}})()");
    await core.CallDevToolsProtocolMethodAsync("Input.insertText",JsonSerializer.Serialize(new {text=S(a,"text")}));
   }else foreach(var type in new[]{"mousePressed","mouseReleased"})await core.CallDevToolsProtocolMethodAsync("Input.dispatchMouseEvent",JsonSerializer.Serialize(new {type,x,y,button="left",clickCount=1}));return new {ok=true};
  }
  if(op=="type_text"){await core.CallDevToolsProtocolMethodAsync("Input.insertText",JsonSerializer.Serialize(new {text=S(a,"text")}));return new {ok=true};}
  if(op=="key"){var key=S(a,"key");var keys=new Dictionary<string,int>{{"Enter",13},{"Tab",9},{"Escape",27},{"Backspace",8},{"Delete",46},{"ArrowLeft",37},{"ArrowUp",38},{"ArrowRight",39},{"ArrowDown",40},{"Home",36},{"End",35},{"PageUp",33},{"PageDown",34}};if(!keys.TryGetValue(key,out var code))throw new Exception("Unsupported key");foreach(var type in new[]{"keyDown","keyUp"}){var values=new Dictionary<string,object>{{"type",type},{"key",key},{"windowsVirtualKeyCode",code}};if(key=="Enter"&&type=="keyDown")values["text"]="\r";await core.CallDevToolsProtocolMethodAsync("Input.dispatchKeyEvent",JsonSerializer.Serialize(values));}return new {ok=true};}
  if(op=="scroll"){await core.CallDevToolsProtocolMethodAsync("Input.dispatchMouseEvent",JsonSerializer.Serialize(new {type="mouseWheel",x=300,y=300,deltaX=0,deltaY=N(a,"deltaY")}));return new {ok=true};}
  throw new Exception("Unsupported operation");
 }
}
