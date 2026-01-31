// Prevents additional console window on Windows in release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use tauri::{command, Window};
use tokio::sync::oneshot;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// 读取JSON文件
#[command]
async fn read_json_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {}", e))
}

/// 写入JSON文件
#[command]
async fn write_json_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content)
        .map_err(|e| format!("Failed to write file: {}", e))
}

/// 选择打开文件对话框
#[command]
async fn open_file_dialog() -> Result<Option<String>, String> {
    use tauri::api::dialog::FileDialogBuilder;

    let (tx, rx) = oneshot::channel();
    FileDialogBuilder::new()
        .add_filter("JSON Files", &["json"])
        .pick_file(move |file_path| {
            let _ = tx.send(file_path);
        });

    let file_path = match rx.await {
        Ok(path) => path,
        Err(_) => return Ok(None),
    };
    Ok(file_path.map(|p| p.to_string_lossy().to_string()))
}

/// 选择保存文件对话框
#[command]
async fn save_file_dialog() -> Result<Option<String>, String> {
    use tauri::api::dialog::FileDialogBuilder;

    let (tx, rx) = oneshot::channel();
    FileDialogBuilder::new()
        .add_filter("JSON Files", &["json"])
        .set_file_name("formulas.json")
        .save_file(move |file_path| {
            let _ = tx.send(file_path);
        });

    let file_path = match rx.await {
        Ok(path) => path,
        Err(_) => return Ok(None),
    };
    Ok(file_path.map(|p| p.to_string_lossy().to_string()))
}

/// 获取应用配置目录
#[command]
async fn get_app_config_dir(app: tauri::AppHandle) -> Result<String, String> {
    app.path_resolver()
        .app_config_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Failed to get config directory".to_string())
}

/// 检查文件是否存在
#[command]
async fn file_exists(path: String) -> Result<bool, String> {
    Ok(PathBuf::from(path).exists())
}

/// 设置窗口标题
#[command]
async fn set_window_title(window: Window, title: String) -> Result<(), String> {
    window
        .set_title(&title)
        .map_err(|e| format!("Failed to set title: {}", e))
}

/// 主题设置（存储到本地）
#[command]
async fn set_theme_preference(theme: String) -> Result<(), String> {
    // 可以将主题保存到配置文件
    println!("Theme changed to: {}", theme);
    Ok(())
}

/// 导出LaTeX文件
#[command]
async fn export_latex_file(content: String) -> Result<String, String> {
    use tauri::api::dialog::FileDialogBuilder;

    let (tx, rx) = oneshot::channel();
    FileDialogBuilder::new()
        .add_filter("LaTeX Files", &["tex"])
        .set_file_name("formulas.tex")
        .save_file(move |file_path| {
            let _ = tx.send(file_path);
        });

    let file_path = match rx.await {
        Ok(path) => path,
        Err(_) => None,
    };
    if let Some(path) = file_path {
        fs::write(&path, content)
            .map_err(|e| format!("Failed to write LaTeX file: {}", e))?;
        Ok(path.to_string_lossy().to_string())
    } else {
        Ok(String::new())
    }
}

/// 导出Markdown文件
#[command]
async fn export_markdown_file(content: String) -> Result<String, String> {
    use tauri::api::dialog::FileDialogBuilder;

    let (tx, rx) = oneshot::channel();
    FileDialogBuilder::new()
        .add_filter("Markdown Files", &["md"])
        .set_file_name("formulas.md")
        .save_file(move |file_path| {
            let _ = tx.send(file_path);
        });

    let file_path = match rx.await {
        Ok(path) => path,
        Err(_) => None,
    };
    if let Some(path) = file_path {
        fs::write(&path, content)
            .map_err(|e| format!("Failed to write Markdown file: {}", e))?;
        Ok(path.to_string_lossy().to_string())
    } else {
        Ok(String::new())
    }
}

#[derive(Deserialize)]
struct FormulaItem {
    latex: String,
    note: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct FormulaEntry {
    id: String,
    index: u32,
    latex: String,
    note: Option<String>,
}

fn escape_latex_text(text: &str) -> String {
    text.chars()
        .map(|ch| match ch {
            '\\' | '#' | '%' | '&' | '_' | '$' | '^' | '{' | '}' => format!("\\{}", ch),
            _ => ch.to_string(),
        })
        .collect::<Vec<_>>()
        .join("")
}

#[command]
async fn format_latex(formulas: Vec<FormulaItem>) -> Result<String, String> {
    if formulas.is_empty() {
        return Ok(String::new());
    }
    let body = formulas
        .iter()
        .enumerate()
        .map(|(idx, item)| {
            let note_block = item
                .note
                .as_ref()
                .map(|note| note.trim())
                .filter(|note| !note.is_empty())
                .map(|note| format!("\\noindent\\textbf{{{}}}\\\\\n", escape_latex_text(note)))
                .unwrap_or_default();
            format!(
                "{}\\begin{{equation}}\\label{{eq:{}}}\n{}\n\\end{{equation}}",
                note_block,
                idx + 1,
                item.latex
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    let document = format!(
        "\\documentclass{{article}}\n\\usepackage{{amsmath}}\n\\usepackage{{ctex}}\n\\begin{{document}}\n{}\n\\end{{document}}\n",
        body
    );

    Ok(document)
}

#[command]
async fn format_markdown(formulas: Vec<FormulaItem>) -> Result<String, String> {
    if formulas.is_empty() {
        return Ok(String::new());
    }
    let segments = formulas
        .iter()
        .enumerate()
        .map(|(idx, item)| {
            let mut parts = vec![format!("### 公式 {}", idx + 1)];
            if let Some(note) = item.note.as_ref().map(|n| n.trim()).filter(|n| !n.is_empty()) {
                parts.push(format!("**{}**", note));
            }
            parts.push("$$".to_string());
            parts.push(item.latex.clone());
            parts.push("$$".to_string());
            parts.join("\n\n")
        })
        .collect::<Vec<_>>()
        .join("\n\n");

    Ok(segments)
}

#[derive(Serialize, Deserialize)]
struct TemplateItem {
    id: String,
    name: String,
    latex: String,
    note: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct TemplateCategory {
    id: String,
    name: String,
    templates: Vec<TemplateItem>,
    #[serde(rename = "parentId")]
    parent_id: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct TemplateLibrary {
    categories: Vec<TemplateCategory>,
    #[serde(rename = "selectedCategoryId")]
    selected_category_id: String,
}

fn trimmed_string(value: Option<&Value>) -> Option<String> {
    value
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

#[command]
async fn normalize_formulas(content: String) -> Result<Vec<FormulaEntry>, String> {
    let value: Value = serde_json::from_str(&content)
        .map_err(|_| "文件内容不是有效的 JSON 格式".to_string())?;
    if !value.is_array() {
        if value.get("categories").is_some() {
            return Err("这是模板库文件，请使用“绑定模板”功能导入".to_string());
        }
        return Err("文件格式错误：公式集必须是 JSON 数组".to_string());
    }
    let array = value.as_array().unwrap();
    let mut normalized = Vec::new();
    for (idx, item) in array.iter().enumerate() {
        let latex = trimmed_string(item.get("latex"));
        if latex.is_none() {
            continue;
        }
        let id = trimmed_string(item.get("id")).unwrap_or_else(|| format!("formula-{}", idx + 1));
        let index = item.get("index").and_then(|v| v.as_u64()).unwrap_or((idx + 1) as u64) as u32;
        let note = trimmed_string(item.get("note"));
        normalized.push(FormulaEntry {
            id,
            index,
            latex: latex.unwrap(),
            note,
        });
    }
    Ok(normalized)
}

#[command]
async fn normalize_templates(content: String) -> Result<TemplateLibrary, String> {
    let value: Value = serde_json::from_str(&content)
        .map_err(|_| "文件内容不是有效的 JSON 格式".to_string())?;
    let categories_value = if let Some(categories) = value.get("categories") {
        categories.clone()
    } else {
        value
    };

    fn walk_categories(
        value: &Value,
        parent_id: Option<String>,
        depth: usize,
        acc: &mut Vec<TemplateCategory>,
    ) {
        if depth > 6 {
            return;
        }
        let array = match value.as_array() {
            Some(arr) => arr,
            None => return,
        };
        for (idx, cat) in array.iter().enumerate() {
            let name = trimmed_string(cat.get("name")).unwrap_or_else(|| format!("分类 {}", idx + 1));
            let id = trimmed_string(cat.get("id")).unwrap_or_else(|| format!("category-{}-{}", depth, idx + 1));
            let templates_value = cat.get("templates").and_then(|v| v.as_array()).cloned().unwrap_or_default();
            let mut templates = Vec::new();
            for (tidx, tpl) in templates_value.iter().enumerate() {
                let latex = trimmed_string(tpl.get("latex"));
                if latex.is_none() {
                    continue;
                }
                let name = trimmed_string(tpl.get("name")).unwrap_or_else(|| format!("模板 {}", tidx + 1));
                let tpl_id = trimmed_string(tpl.get("id"))
                    .unwrap_or_else(|| format!("template-{}-{}", id, tidx + 1));
                let note = trimmed_string(tpl.get("note"));
                templates.push(TemplateItem {
                    id: tpl_id,
                    name,
                    latex: latex.unwrap(),
                    note,
                });
            }
            let parent_from_json = trimmed_string(cat.get("parentId"));
            acc.push(TemplateCategory {
                id: id.clone(),
                name,
                templates,
                parent_id: parent_from_json.or_else(|| parent_id.clone()),
            });

            let child = cat.get("categories").or_else(|| cat.get("children"));
            if let Some(child_value) = child {
                walk_categories(child_value, Some(id), depth + 1, acc);
            }
        }
    }

    let mut categories = Vec::new();
    walk_categories(&categories_value, None, 1, &mut categories);

    let selected_category_id = categories.first().map(|c| c.id.clone()).unwrap_or_default();
    Ok(TemplateLibrary { categories, selected_category_id })
}

/// 获取系统信息
#[command]
async fn get_system_info() -> Result<String, String> {
    Ok(format!(
        "OS: {}, Arch: {}",
        std::env::consts::OS,
        std::env::consts::ARCH
    ))
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            read_json_file,
            write_json_file,
            open_file_dialog,
            save_file_dialog,
            get_app_config_dir,
            file_exists,
            set_window_title,
            set_theme_preference,
            export_latex_file,
            export_markdown_file,
            format_latex,
            format_markdown,
            normalize_formulas,
            normalize_templates,
            get_system_info,
        ])
        .setup(|_app| {
            // 初始化应用
            println!("MathLive Formula Editor - Rust Backend Started");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
