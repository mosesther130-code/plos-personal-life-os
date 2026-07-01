// PLOS — Resume Hub (Enhancement 4a)
// Resume + Job Description + Other career file management.
// Upload via expo-document-picker; build a structured resume; polish via Claude; download as PDF/DOCX.
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
  RefreshControl,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import {
  ArrowLeft,
  Upload,
  FilePlus,
  FileText,
  Briefcase,
  Folder,
  Download,
  Trash2,
  Pencil,
  Sparkles,
  Plus,
  X,
  Save,
} from "lucide-react-native";

import { careerFilesApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";
import { EditModal, type Field } from "@/src/components/EditModal";
import { ResumeVaultPanel } from "@/src/components/ResumeVaultPanel";

const ACCEPT = "application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/png,image/jpeg";

function fmtSize(b: number) {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}
function fmtDate(iso?: string) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

function fileIconBg(kind: string) {
  if (kind === "resume") return colors.primaryGlow;
  if (kind === "job_description") return colors.warning;
  return colors.textTertiary;
}

const RESUME_FIELDS: Field[] = [
  { key: "full_name", label: "Full Name", kind: "text" },
  { key: "email", label: "Email", kind: "text" },
  { key: "phone", label: "Phone", kind: "text" },
  { key: "location", label: "Location", kind: "text" },
  { key: "summary", label: "Professional Summary", kind: "textarea", maxLength: 600 },
];

const WORK_FIELDS: Field[] = [
  { key: "title", label: "Title", kind: "text" },
  { key: "employer", label: "Employer", kind: "text" },
  { key: "location", label: "Location", kind: "text" },
  { key: "start_date", label: "Start (e.g. Jan 2022)", kind: "text" },
  { key: "end_date", label: "End (e.g. Present)", kind: "text" },
  { key: "bullets_text", label: "Bullets (one per line)", kind: "textarea", maxLength: 1500 },
];

const EDU_FIELDS: Field[] = [
  { key: "degree", label: "Degree", kind: "text" },
  { key: "institution", label: "Institution", kind: "text" },
  { key: "year", label: "Year", kind: "text" },
  { key: "notes", label: "Notes", kind: "textarea", maxLength: 400 },
];

const CERT_FIELDS: Field[] = [
  { key: "name", label: "Certification", kind: "text" },
  { key: "issuer", label: "Issuer", kind: "text" },
  { key: "year", label: "Year", kind: "text" },
];

const emptyDraft = () => ({
  full_name: "",
  email: "",
  phone: "",
  location: "",
  summary: "",
  work_experience: [] as any[],
  education: [] as any[],
  skills: [] as string[],
  certifications: [] as any[],
  awards: [] as string[],
});

export default function ResumeHub() {
  const router = useRouter();
  const [tab, setTab] = useState<"vault" | "builder">("vault");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [files, setFiles] = useState<any[]>([]);
  const [draft, setDraft] = useState<any>(emptyDraft());
  const [showResumeForm, setShowResumeForm] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // Sub-edit modals
  const [headerModal, setHeaderModal] = useState(false);
  const [workModal, setWorkModal] = useState<{ open: boolean; idx?: number; item?: any }>({ open: false });
  const [eduModal, setEduModal] = useState<{ open: boolean; idx?: number; item?: any }>({ open: false });
  const [certModal, setCertModal] = useState<{ open: boolean; idx?: number; item?: any }>({ open: false });

  const [skillInput, setSkillInput] = useState("");
  const [awardInput, setAwardInput] = useState("");

  const load = useCallback(async () => {
    try {
      const [f, d] = await Promise.all([careerFilesApi.listFiles(), careerFilesApi.getResumeDraft()]);
      setFiles(f.files || []);
      if (d.draft) setDraft({ ...emptyDraft(), ...d.draft });
    } catch (_e) {}
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const persistDraft = async (next: any) => {
    setDraft(next);
    try {
      await careerFilesApi.saveResumeDraft(next);
    } catch (e: any) {
      Alert.alert("Save failed", e?.message || "Could not save resume draft.");
    }
  };

  const pickAndUpload = async (kind: "resume" | "job_description" | "other") => {
    try {
      setUploading(kind);
      const res = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: kind === "other" ? "*/*" : ACCEPT.split(","),
      });
      if (res.canceled) {
        setUploading(null);
        return;
      }
      const asset = res.assets?.[0];
      if (!asset) {
        setUploading(null);
        return;
      }

      let blob: Blob;
      if (Platform.OS === "web") {
        // expo-document-picker on web gives us a File via file URI; fetch returns the blob
        const fetched = await fetch(asset.uri);
        blob = await fetched.blob();
      } else {
        // Native: read as base64 then convert
        const Legacy: any = (FileSystem as any).legacy || FileSystem;
        const b64 = await Legacy.readAsStringAsync(asset.uri, { encoding: "base64" });
        // turn base64 into Uint8Array → Blob
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        blob = new Blob([bytes], { type: asset.mimeType || "application/octet-stream" });
      }
      // Attach a name to the blob for FormData filename
      const named = blob;
      (named as any).name = asset.name || "upload";

      await careerFilesApi.uploadFile(named as File, { kind, filename: asset.name });
      await load();
    } catch (e: any) {
      Alert.alert("Upload failed", e?.message || "Could not upload file.");
    } finally {
      setUploading(null);
    }
  };

  const deleteFile = async (fileId: string, name: string) => {
    const ok = (() => {
      if (Platform.OS === "web") {
        // @ts-ignore
        return window.confirm?.(`Delete "${name}"?`);
      }
      return true;
    })();
    if (!ok) return;
    try {
      await careerFilesApi.deleteFile(fileId);
      await load();
    } catch (e: any) {
      Alert.alert("Delete failed", e?.message);
    }
  };

  const downloadCareerFile = async (file: any) => {
    try {
      const r = await careerFilesApi.downloadFile(file.file_id);
      if (Platform.OS === "web") {
        const dataUrl = `data:${r.mime_type};base64,${r.content_base64}`;
        // @ts-ignore
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = r.filename;
        a.target = "_blank";
        a.rel = "noopener";
        // @ts-ignore
        document.body.appendChild(a);
        a.click();
        // @ts-ignore
        document.body.removeChild(a);
      } else {
        const Legacy: any = (FileSystem as any).legacy || FileSystem;
        const dir = Legacy.cacheDirectory || Legacy.documentDirectory;
        const path = `${dir}${r.filename}`;
        await Legacy.writeAsStringAsync(path, r.content_base64, { encoding: "base64" });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(path, { mimeType: r.mime_type, dialogTitle: r.filename });
        }
      }
    } catch (e: any) {
      Alert.alert("Download failed", e?.message);
    }
  };

  const onPolish = async () => {
    setPolishing(true);
    try {
      const r = await careerFilesApi.polishResume();
      if (r?.draft) setDraft({ ...emptyDraft(), ...r.draft });
      Alert.alert("Polished", "Your summary and bullets have been rewritten by Claude.");
    } catch (e: any) {
      Alert.alert("Polish failed", e?.message);
    }
    setPolishing(false);
  };

  const onDownloadResume = async (format: "pdf" | "docx") => {
    setDownloading(true);
    try {
      const r = await careerFilesApi.downloadResume(format);
      if (Platform.OS === "web") {
        const dataUrl = `data:${r.mime_type};base64,${r.content_base64}`;
        // @ts-ignore
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = r.filename;
        a.target = "_blank";
        a.rel = "noopener";
        // @ts-ignore
        document.body.appendChild(a);
        a.click();
        // @ts-ignore
        document.body.removeChild(a);
      } else {
        const Legacy: any = (FileSystem as any).legacy || FileSystem;
        const dir = Legacy.cacheDirectory || Legacy.documentDirectory;
        const path = `${dir}${r.filename}`;
        await Legacy.writeAsStringAsync(path, r.content_base64, { encoding: "base64" });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(path, { mimeType: r.mime_type, dialogTitle: r.filename });
        }
      }
    } catch (e: any) {
      Alert.alert("Download failed", e?.message);
    }
    setDownloading(false);
  };

  // Header save handler
  const onSaveHeader = async (vals: any) => {
    await persistDraft({ ...draft, ...vals });
  };

  // Work entries
  const onSaveWork = async (vals: any) => {
    const entry = {
      title: vals.title,
      employer: vals.employer,
      location: vals.location || "",
      start_date: vals.start_date || "",
      end_date: vals.end_date || "",
      bullets: (vals.bullets_text || "")
        .split("\n")
        .map((s: string) => s.trim())
        .filter(Boolean),
    };
    const next = [...(draft.work_experience || [])];
    if (workModal.idx != null) {
      next[workModal.idx] = entry;
    } else {
      next.push(entry);
    }
    await persistDraft({ ...draft, work_experience: next });
  };
  const onDeleteWork = async () => {
    if (workModal.idx == null) return;
    const next = [...(draft.work_experience || [])];
    next.splice(workModal.idx, 1);
    await persistDraft({ ...draft, work_experience: next });
  };

  // Education entries
  const onSaveEdu = async (vals: any) => {
    const next = [...(draft.education || [])];
    if (eduModal.idx != null) next[eduModal.idx] = vals;
    else next.push(vals);
    await persistDraft({ ...draft, education: next });
  };
  const onDeleteEdu = async () => {
    if (eduModal.idx == null) return;
    const next = [...(draft.education || [])];
    next.splice(eduModal.idx, 1);
    await persistDraft({ ...draft, education: next });
  };

  // Certifications
  const onSaveCert = async (vals: any) => {
    const next = [...(draft.certifications || [])];
    if (certModal.idx != null) next[certModal.idx] = vals;
    else next.push(vals);
    await persistDraft({ ...draft, certifications: next });
  };
  const onDeleteCert = async () => {
    if (certModal.idx == null) return;
    const next = [...(draft.certifications || [])];
    next.splice(certModal.idx, 1);
    await persistDraft({ ...draft, certifications: next });
  };

  // Skills & awards
  const addSkill = async () => {
    const t = skillInput.trim();
    if (!t) return;
    setSkillInput("");
    await persistDraft({ ...draft, skills: [...(draft.skills || []), t] });
  };
  const removeSkill = async (i: number) => {
    const next = [...(draft.skills || [])];
    next.splice(i, 1);
    await persistDraft({ ...draft, skills: next });
  };
  const addAward = async () => {
    const t = awardInput.trim();
    if (!t) return;
    setAwardInput("");
    await persistDraft({ ...draft, awards: [...(draft.awards || []), t] });
  };
  const removeAward = async (i: number) => {
    const next = [...(draft.awards || [])];
    next.splice(i, 1);
    await persistDraft({ ...draft, awards: next });
  };

  // resumeFiles now live in the Vault tab (user_resumes collection).
  // Keeping the filter derived only for reference/back-compat elsewhere.
  const jdFiles = files.filter((f) => f.kind === "job_description");
  const otherFiles = files.filter((f) => f.kind === "other");

  const hasResumeData = (draft.full_name || draft.work_experience?.length || draft.education?.length);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="rh-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Resume Hub</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primaryGlow} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryGlow} />}
        >
          {/* Tab switcher */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tabBtn, tab === "vault" && styles.tabBtnActive]}
              onPress={() => setTab("vault")}
              testID="tab-vault"
            >
              <Text style={[styles.tabText, tab === "vault" && styles.tabTextActive]}>
                Vault
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, tab === "builder" && styles.tabBtnActive]}
              onPress={() => setTab("builder")}
              testID="tab-builder"
            >
              <Text style={[styles.tabText, tab === "builder" && styles.tabTextActive]}>
                Builder
              </Text>
            </TouchableOpacity>
          </View>

          {tab === "vault" ? (
            <ResumeVaultPanel />
          ) : (
          <>
          {/* Quick Actions */}
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionGrid}>
            <ActionTile
              icon={<FilePlus color="#fff" size={18} />}
              label="Create Resume"
              onPress={() => setShowResumeForm(true)}
              bg={colors.primaryGlow}
              testID="create-resume"
            />
            <ActionTile
              icon={<Download color="#fff" size={18} />}
              label="Download Resume"
              loading={downloading}
              disabled={!hasResumeData}
              onPress={() => {
                Alert.alert(
                  "Format",
                  "Choose download format",
                  [
                    { text: "PDF", onPress: () => onDownloadResume("pdf") },
                    { text: "Word (DOCX)", onPress: () => onDownloadResume("docx") },
                    { text: "Cancel", style: "cancel" },
                  ],
                );
              }}
              bg={colors.success}
              testID="download-resume"
            />
            <ActionTile
              icon={<Briefcase color="#fff" size={18} />}
              label="Upload Job Description"
              loading={uploading === "job_description"}
              onPress={() => pickAndUpload("job_description")}
              bg={colors.warning}
              testID="upload-jd"
            />
            <ActionTile
              icon={<Folder color="#fff" size={18} />}
              label="Upload Other File"
              loading={uploading === "other"}
              onPress={() => pickAndUpload("other")}
              bg={colors.textSecondary}
              testID="upload-other"
            />
          </View>

          {/* Resume Form (toggle) */}
          {showResumeForm && (
            <View style={styles.resumeForm}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>Resume Builder</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    style={styles.aiSmallBtn}
                    onPress={onPolish}
                    disabled={polishing || !hasResumeData}
                    testID="polish-resume"
                  >
                    {polishing ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Sparkles size={12} color="#fff" />
                    )}
                    <Text style={styles.aiSmallText}>Polish with AI</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.closeFormBtn}
                    onPress={() => setShowResumeForm(false)}
                    testID="close-form"
                  >
                    <X size={14} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Header */}
              <View style={styles.subSection}>
                <View style={styles.subHead}>
                  <Text style={styles.subTitle}>Personal Info</Text>
                  <TouchableOpacity onPress={() => setHeaderModal(true)} testID="edit-header">
                    <Pencil size={12} color={colors.textTertiary} />
                  </TouchableOpacity>
                </View>
                {draft.full_name ? (
                  <View>
                    <Text style={styles.resumeName}>{draft.full_name}</Text>
                    <Text style={styles.resumeContact}>
                      {[draft.email, draft.phone, draft.location].filter(Boolean).join(" · ")}
                    </Text>
                    {draft.summary ? <Text style={styles.resumeSummary}>{draft.summary}</Text> : null}
                  </View>
                ) : (
                  <Text style={styles.emptyText}>Tap pencil to add your name, contact, and summary.</Text>
                )}
              </View>

              {/* Work Experience */}
              <ListSection
                title="Work Experience"
                empty="No work entries yet."
                items={draft.work_experience || []}
                onAdd={() => setWorkModal({ open: true, item: { bullets_text: "" } })}
                onEditAt={(i) => {
                  const w = draft.work_experience[i];
                  setWorkModal({ open: true, idx: i, item: { ...w, bullets_text: (w.bullets || []).join("\n") } });
                }}
                render={(w) => (
                  <View>
                    <Text style={styles.workTitle}>
                      {w.title} — {w.employer}
                    </Text>
                    <Text style={styles.workMeta}>
                      {[w.location, [w.start_date, w.end_date].filter(Boolean).join(" – ")].filter(Boolean).join(" · ")}
                    </Text>
                    {(w.bullets || []).slice(0, 3).map((b: string, i: number) => (
                      <Text key={i} style={styles.workBullet}>• {b}</Text>
                    ))}
                    {(w.bullets || []).length > 3 ? (
                      <Text style={styles.workBullet}>+{w.bullets.length - 3} more…</Text>
                    ) : null}
                  </View>
                )}
              />

              {/* Education */}
              <ListSection
                title="Education"
                empty="No education entries yet."
                items={draft.education || []}
                onAdd={() => setEduModal({ open: true, item: {} })}
                onEditAt={(i) => setEduModal({ open: true, idx: i, item: draft.education[i] })}
                render={(e) => (
                  <View>
                    <Text style={styles.workTitle}>{e.degree} — {e.institution}</Text>
                    <Text style={styles.workMeta}>{e.year || ""}{e.notes ? ` · ${e.notes}` : ""}</Text>
                  </View>
                )}
              />

              {/* Skills */}
              <View style={styles.subSection}>
                <Text style={styles.subTitle}>Skills</Text>
                <View style={styles.skillRow}>
                  {(draft.skills || []).map((s: string, i: number) => (
                    <TouchableOpacity key={i} style={styles.skillChip} onPress={() => removeSkill(i)} testID={`skill-${i}`}>
                      <Text style={styles.skillText}>{s}</Text>
                      <X size={10} color={colors.textTertiary} />
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.tagInputRow}>
                  <TextInput
                    style={styles.tagInput}
                    placeholder="Add a skill"
                    placeholderTextColor={colors.textTertiary}
                    value={skillInput}
                    onChangeText={setSkillInput}
                    onSubmitEditing={addSkill}
                    testID="skill-input"
                  />
                  <TouchableOpacity style={styles.tagAddBtn} onPress={addSkill} testID="add-skill">
                    <Plus size={14} color={colors.primaryGlow} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Certifications */}
              <ListSection
                title="Certifications"
                empty="No certifications yet."
                items={draft.certifications || []}
                onAdd={() => setCertModal({ open: true, item: {} })}
                onEditAt={(i) => setCertModal({ open: true, idx: i, item: draft.certifications[i] })}
                render={(c) => (
                  <View>
                    <Text style={styles.workTitle}>{c.name}</Text>
                    <Text style={styles.workMeta}>{[c.issuer, c.year].filter(Boolean).join(" · ")}</Text>
                  </View>
                )}
              />

              {/* Awards */}
              <View style={styles.subSection}>
                <Text style={styles.subTitle}>Awards</Text>
                {(draft.awards || []).map((a: string, i: number) => (
                  <View key={i} style={styles.awardRow}>
                    <Text style={styles.awardText}>• {a}</Text>
                    <TouchableOpacity onPress={() => removeAward(i)} testID={`award-${i}`}>
                      <X size={12} color={colors.textTertiary} />
                    </TouchableOpacity>
                  </View>
                ))}
                <View style={styles.tagInputRow}>
                  <TextInput
                    style={styles.tagInput}
                    placeholder="Add an award"
                    placeholderTextColor={colors.textTertiary}
                    value={awardInput}
                    onChangeText={setAwardInput}
                    onSubmitEditing={addAward}
                    testID="award-input"
                  />
                  <TouchableOpacity style={styles.tagAddBtn} onPress={addAward} testID="add-award">
                    <Plus size={14} color={colors.primaryGlow} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* Files — hide "My Resumes" (now lives in the Vault tab).
              Keep JD + Other for the Builder tab. */}
          <FileListSection title="Job Descriptions" files={jdFiles} onDownload={downloadCareerFile} onDelete={deleteFile} kind="job_description" />
          <FileListSection title="Other Career Files" files={otherFiles} onDownload={downloadCareerFile} onDelete={deleteFile} kind="other" />

          <View style={{ height: 80 }} />
          </>
          )}
        </ScrollView>
      )}

      {/* Modals */}
      <EditModal
        visible={headerModal}
        title="Personal Info & Summary"
        fields={RESUME_FIELDS}
        initial={{
          full_name: draft.full_name || "",
          email: draft.email || "",
          phone: draft.phone || "",
          location: draft.location || "",
          summary: draft.summary || "",
        }}
        onClose={() => setHeaderModal(false)}
        onSubmit={onSaveHeader}
        testID="header-modal"
      />

      <EditModal
        visible={workModal.open}
        title={workModal.idx != null ? "Edit Experience" : "Add Experience"}
        fields={WORK_FIELDS}
        initial={workModal.item || { bullets_text: "" }}
        onClose={() => setWorkModal({ open: false })}
        onSubmit={onSaveWork}
        onDelete={workModal.idx != null ? onDeleteWork : undefined}
        testID="work-modal"
      />

      <EditModal
        visible={eduModal.open}
        title={eduModal.idx != null ? "Edit Education" : "Add Education"}
        fields={EDU_FIELDS}
        initial={eduModal.item || {}}
        onClose={() => setEduModal({ open: false })}
        onSubmit={onSaveEdu}
        onDelete={eduModal.idx != null ? onDeleteEdu : undefined}
        testID="edu-modal"
      />

      <EditModal
        visible={certModal.open}
        title={certModal.idx != null ? "Edit Certification" : "Add Certification"}
        fields={CERT_FIELDS}
        initial={certModal.item || {}}
        onClose={() => setCertModal({ open: false })}
        onSubmit={onSaveCert}
        onDelete={certModal.idx != null ? onDeleteCert : undefined}
        testID="cert-modal"
      />
    </SafeAreaView>
  );
}

// --------------------------- subcomponents -------------------------------
interface ActionTileProps {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  bg: string;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
}
function ActionTile(props: ActionTileProps) {
  return (
    <TouchableOpacity
      style={[styles.actionTile, { backgroundColor: props.bg }, props.disabled && { opacity: 0.45 }]}
      onPress={props.onPress}
      disabled={props.disabled || props.loading}
      activeOpacity={0.85}
      testID={props.testID}
    >
      {props.loading ? <ActivityIndicator size="small" color="#fff" /> : props.icon}
      <Text style={styles.actionLabel} numberOfLines={2}>{props.label}</Text>
    </TouchableOpacity>
  );
}

interface ListSectionProps {
  title: string;
  items: any[];
  empty: string;
  onAdd: () => void;
  onEditAt: (i: number) => void;
  render: (item: any) => React.ReactNode;
}
function ListSection(props: ListSectionProps) {
  return (
    <View style={styles.subSection}>
      <View style={styles.subHead}>
        <Text style={styles.subTitle}>{props.title}</Text>
        <TouchableOpacity onPress={props.onAdd}>
          <Plus size={14} color={colors.primaryGlow} />
        </TouchableOpacity>
      </View>
      {props.items.length === 0 ? (
        <Text style={styles.emptyText}>{props.empty}</Text>
      ) : (
        props.items.map((it, i) => (
          <TouchableOpacity
            key={i}
            style={styles.listItem}
            onPress={() => props.onEditAt(i)}
            activeOpacity={0.7}
          >
            <View style={{ flex: 1 }}>{props.render(it)}</View>
            <Pencil size={12} color={colors.textTertiary} />
          </TouchableOpacity>
        ))
      )}
    </View>
  );
}

interface FileListSectionProps {
  title: string;
  files: any[];
  kind: string;
  onDownload: (f: any) => void;
  onDelete: (id: string, name: string) => void;
}
function FileListSection(props: FileListSectionProps) {
  return (
    <View style={styles.fileSection}>
      <Text style={styles.sectionTitle}>{props.title}</Text>
      {props.files.length === 0 ? (
        <Text style={styles.emptyText}>None yet.</Text>
      ) : (
        props.files.map((f) => (
          <View key={f.file_id} style={styles.fileRow}>
            <View style={[styles.fileIconBox, { backgroundColor: fileIconBg(props.kind) + "22", borderColor: fileIconBg(props.kind) }]}>
              <FileText size={16} color={fileIconBg(props.kind)} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fileName} numberOfLines={1}>{f.filename}</Text>
              <Text style={styles.fileMeta}>
                {fmtDate(f.uploaded_at)} · {fmtSize(f.size)}
              </Text>
            </View>
            <TouchableOpacity onPress={() => props.onDownload(f)} style={styles.fileBtn} testID={`dl-${f.file_id}`}>
              <Download size={14} color={colors.primaryGlow} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => props.onDelete(f.file_id, f.filename)}
              style={styles.fileBtn}
              testID={`del-${f.file_id}`}
            >
              <Trash2 size={14} color={colors.danger} />
            </TouchableOpacity>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.md },
  tabRow: {
    flexDirection: "row", backgroundColor: colors.surface,
    borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.md, padding: 3,
  },
  tabBtn: {
    flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: radius.sm,
  },
  tabBtnActive: { backgroundColor: colors.primaryMuted },
  tabText: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  tabTextActive: { color: colors.primaryGlow },

  sectionTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700", marginTop: spacing.md },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.md },

  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  actionTile: {
    width: "47%", minHeight: 70,
    flexDirection: "row", alignItems: "center",
    gap: spacing.sm, padding: spacing.md,
    borderRadius: radius.md,
  },
  actionLabel: { color: "#fff", fontSize: 12, fontWeight: "700", flex: 1 },

  resumeForm: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1, borderColor: colors.borderSubtle,
    gap: spacing.sm,
  },
  closeFormBtn: { padding: 6, borderRadius: 6, backgroundColor: colors.bg },
  aiSmallBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: colors.primary, borderRadius: radius.sm,
  },
  aiSmallText: { color: "#fff", fontSize: 11, fontWeight: "700" },

  subSection: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1, borderColor: colors.borderSubtle,
    gap: 6,
  },
  subHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  subTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: "700" },
  resumeName: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  resumeContact: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  resumeSummary: { color: colors.textPrimary, fontSize: 12, lineHeight: 17, marginTop: 6 },

  listItem: {
    flexDirection: "row", alignItems: "flex-start",
    paddingVertical: 8, gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  workTitle: { color: colors.textPrimary, fontSize: 12, fontWeight: "700" },
  workMeta: { color: colors.textTertiary, fontSize: 10, marginTop: 2 },
  workBullet: { color: colors.textSecondary, fontSize: 11, marginTop: 2, lineHeight: 15 },

  skillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  skillChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.primaryGlow,
  },
  skillText: { color: colors.primaryGlow, fontSize: 11, fontWeight: "600" },
  tagInputRow: { flexDirection: "row", gap: 6, marginTop: 6 },
  tagInput: {
    flex: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    color: colors.textPrimary,
    fontSize: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.borderSubtle,
  },
  tagAddBtn: {
    paddingHorizontal: 12, justifyContent: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.primaryGlow,
  },
  awardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 },
  awardText: { color: colors.textPrimary, fontSize: 11, flex: 1 },

  fileSection: { marginTop: spacing.md, gap: 6 },
  fileRow: {
    flexDirection: "row", alignItems: "center",
    padding: spacing.sm, gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.borderSubtle,
  },
  fileIconBox: { width: 30, height: 30, borderRadius: 6, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  fileName: { color: colors.textPrimary, fontSize: 12, fontWeight: "700" },
  fileMeta: { color: colors.textTertiary, fontSize: 10, marginTop: 2 },
  fileBtn: { padding: 8, borderRadius: 6, backgroundColor: colors.bg },

  emptyText: { color: colors.textTertiary, fontSize: 11, fontStyle: "italic" },
});
