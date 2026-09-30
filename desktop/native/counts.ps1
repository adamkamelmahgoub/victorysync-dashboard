# Outputs aggregate counts only. No keyboard key codes or typed content are read.
$ErrorActionPreference = 'Stop'
Add-Type -ReferencedAssemblies System.Windows.Forms -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using System.Text;
public class VictoryCounts {
  delegate IntPtr Hook(int code, IntPtr message, IntPtr unused);
  [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int kind, Hook cb, IntPtr mod, uint thread);
  [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook,int code,IntPtr message,IntPtr unused);
  [DllImport("kernel32.dll",CharSet=CharSet.Auto)] static extern IntPtr GetModuleHandle(string name);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr window,StringBuilder text,int count);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out uint process);
  static volatile bool titles;
  static string Enc(string text){return Convert.ToBase64String(Encoding.UTF8.GetBytes(text));}
  static string WindowFields(){
    if(!Enabled || !titles)return "";
    try{IntPtr window=GetForegroundWindow();var text=new StringBuilder(501);GetWindowText(window,text,501);uint pid;GetWindowThreadProcessId(window,out pid);
      return ",\"app\":\""+Enc(Process.GetProcessById((int)pid).ProcessName)+"\",\"title\":\""+Enc(text.ToString())+"\"";
    }catch{return "";}
  }
  static int keys, clicks, moves;
  static long expires;
  static Hook keyboard=OnKeyboard, mouse=OnMouse;
  static bool Enabled { get {return DateTime.UtcNow.Ticks < Interlocked.Read(ref expires);} }
  static IntPtr OnKeyboard(int code,IntPtr message,IntPtr unused) {
    if(code>=0 && Enabled && (message.ToInt64()==0x100 || message.ToInt64()==0x104)) Interlocked.Increment(ref keys);
    return CallNextHookEx(IntPtr.Zero,code,message,unused);
  }
  static IntPtr OnMouse(int code,IntPtr message,IntPtr unused) {
    if(code>=0 && Enabled) { long kind=message.ToInt64();
      if(kind==0x200)Interlocked.Increment(ref moves);
      if(kind==0x201 || kind==0x204 || kind==0x207 || kind==0x20B)Interlocked.Increment(ref clicks);
    }
    return CallNextHookEx(IntPtr.Zero,code,message,unused);
  }
  public static void Run() {
    var input=new Thread(()=>{string line;while((line=Console.ReadLine())!=null){var parts=line.Split(',');int ms;if(Int32.TryParse(parts[0],out ms)){titles=parts.Length>1 && parts[1]=="1";Interlocked.Exchange(ref expires,DateTime.UtcNow.AddMilliseconds(Math.Max(0,Math.Min(20000,ms))).Ticks);}}Environment.Exit(0);});input.IsBackground=true;input.Start();
    IntPtr kh=SetWindowsHookEx(13,keyboard,GetModuleHandle(null),0),mh=SetWindowsHookEx(14,mouse,GetModuleHandle(null),0);
    if(kh==IntPtr.Zero || mh==IntPtr.Zero)throw new Exception("Unable to initialize activity counters");
    var timer=new System.Windows.Forms.Timer();timer.Interval=1000;
    timer.Tick+=(sender,args)=>{Console.WriteLine("{\"keys\":"+Interlocked.Exchange(ref keys,0)+",\"clicks\":"+Interlocked.Exchange(ref clicks,0)+",\"movements\":"+Interlocked.Exchange(ref moves,0)+WindowFields()+"}");};timer.Start();
    try{Application.Run();}finally{UnhookWindowsHookEx(kh);UnhookWindowsHookEx(mh);}
  }
}
'@
[VictoryCounts]::Run()
