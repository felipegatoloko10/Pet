#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use tauri::{Manager, menu::{MenuBuilder, MenuItemBuilder},tray::TrayIconBuilder};
fn trace_shutdown(message: &str) {
 if let Ok(path) = std::env::var("PINGO_SHUTDOWN_TRACE") {
  use std::io::Write;
  if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
   let _ = writeln!(file,"{}",message);
  }
 }
}

#[tauri::command]
fn read_session() -> Result<String, String> {
 let entry=keyring::Entry::new("Pingo","session").map_err(|_|"Armazenamento seguro indisponível")?;
 match entry.get_password(){Ok(value)=>Ok(value),Err(keyring::Error::NoEntry)=>Ok(String::new()),Err(_)=>Err("Não consegui ler a sessão protegida".into())}
}
#[tauri::command]
fn save_session(token:String)->Result<(),String>{
 if token.len()>8192{return Err("Sessão inválida".into());}
 let entry=keyring::Entry::new("Pingo","session").map_err(|_|"Armazenamento seguro indisponível")?;
 if token.is_empty(){match entry.delete_credential(){Ok(())|Err(keyring::Error::NoEntry)=>Ok(()),Err(_)=>Err("Não consegui remover a sessão protegida".into())}}else{entry.set_password(&token).map_err(|_|"Não consegui proteger a sessão".into())}
}
#[tauri::command]
fn open_panel(app:tauri::AppHandle){if let Some(window)=app.get_webview_window("main"){let _=window.unminimize();let _=window.show();let _=window.set_focus();}}
#[tauri::command]
fn show_device_code(app:tauri::AppHandle,code:String){if let Some(window)=app.get_webview_window("main"){let _=window.set_title(&format!("Pingo — confirme o código {} no navegador",code));}}
fn main(){tauri::Builder::default()
 .plugin(tauri_plugin_single_instance::init(|app,_,_|open_panel(app.clone())))
 .plugin(tauri::plugin::Builder::new("shutdown-observer").on_event(|_,event|match event{
 tauri::RunEvent::ExitRequested{..}=>trace_shutdown("exit requested: before plugin cleanup"),
 tauri::RunEvent::Exit=>trace_shutdown("exit: before plugin cleanup"),_=>()
 }).build())
 .plugin(tauri_plugin_deep_link::init())
 .plugin(tauri_plugin_opener::init()).plugin(tauri_plugin_sql::Builder::default().build()).plugin(tauri_plugin_notification::init())
 .invoke_handler(tauri::generate_handler![read_session,save_session,open_panel,show_device_code,quit_pingo])
 .setup(|app|{let open=MenuItemBuilder::with_id("open","Meu dia").build(app)?;let pet=MenuItemBuilder::with_id("pet","Mostrar / esconder Pingo").build(app)?;let quit=MenuItemBuilder::with_id("quit","Sair do Pingo").build(app)?;let menu=MenuBuilder::new(app).items(&[&open,&pet,&quit]).build()?;
 let mut tray=TrayIconBuilder::new().tooltip("Pingo — um passo de cada vez").menu(&menu).on_menu_event(|app,event|match event.id().as_ref(){"open"=>open_panel(app.clone()),"pet"=>{if let Some(w)=app.get_webview_window("pet"){if w.is_visible().unwrap_or(false){let _=w.hide();}else{let _=w.show();}}},"quit"=>app.exit(0),_=>()});if let Some(icon)=app.default_window_icon(){tray=tray.icon(icon.clone());}tray.build(app)?;
 if let Some(w)=app.get_webview_window("pet"){if let Ok(Some(monitor))=w.current_monitor(){if let Ok(window_size)=w.outer_size(){let size=monitor.size();let origin=monitor.position();let _=w.set_position(tauri::PhysicalPosition::new(origin.x+size.width as i32-window_size.width as i32-16,origin.y+size.height as i32-window_size.height as i32-60));}}}
 Ok(())})
 .on_window_event(|window,event|{if let tauri::WindowEvent::CloseRequested{api,..}=event{
 trace_shutdown(&format!("close requested: {}",window.label()));
 // Let the application exit own both webviews instead of destroying one while exit is queued.
 api.prevent_close();
 window.app_handle().exit(0);
 trace_shutdown("exit request queued");
 }})
 .build(tauri::generate_context!()).expect("Não foi possível iniciar o Pingo")
 .run(|_,event|match event{
 tauri::RunEvent::ExitRequested{..}=>trace_shutdown("exit requested: after plugins"),
 tauri::RunEvent::Exit=>trace_shutdown("exit: after plugins"),_=>()
 });trace_shutdown("event loop returned");}

#[tauri::command]
fn quit_pingo(app:tauri::AppHandle){app.exit(0);}
