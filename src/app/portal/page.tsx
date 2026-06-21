"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

/* ------------------------------------------------------------------ */
/*  DATA                                                               */
/* ------------------------------------------------------------------ */

const CASE_TYPES = [
  "Order Issue",
  "Shipping Problem",
  "Return / Exchange",
  "Customisation Request",
  "Payment Issue",
  "Product Question",
  "Loyalty Program",
  "Other",
] as const;

type Category = {
  icon: string;
  title: string;
  description: string;
  type: string;
  articles: { label: string; subject: string }[];
};

const CATEGORIES: Category[] = [
  {
    icon: "\u{1F4E6}",
    title: "Orders",
    description: "Track, modify, or cancel your orders",
    type: "Order Issue",
    articles: [
      { label: "Where is my order?", subject: "Order tracking inquiry" },
      { label: "I need to change my order", subject: "Order modification request" },
      { label: "I received the wrong item", subject: "Wrong item received" },
      { label: "My order is missing items", subject: "Missing items in order" },
    ],
  },
  {
    icon: "\u{1F69A}",
    title: "Shipping",
    description: "Delivery times, tracking & international shipping",
    type: "Shipping Problem",
    articles: [
      { label: "Shipping times to my country", subject: "International shipping inquiry" },
      { label: "My package shows delivered but I didn\u2019t receive it", subject: "Package not received" },
      { label: "Can I change my shipping address?", subject: "Shipping address change" },
    ],
  },
  {
    icon: "\u{1F504}",
    title: "Returns & Exchange",
    description: "Return policy, exchanges & refund status",
    type: "Return / Exchange",
    articles: [
      { label: "How do I return an item?", subject: "Return request" },
      { label: "What is your exchange policy?", subject: "Exchange policy inquiry" },
      { label: "When will I get my refund?", subject: "Refund status inquiry" },
    ],
  },
  {
    icon: "\u{2702}\uFE0F",
    title: "Customisation",
    description: "Custom prints, sizing & special requests",
    type: "Customisation Request",
    articles: [
      { label: "Can I get a custom print?", subject: "Custom print request" },
      { label: "Size guide & measurements", subject: "Size guide inquiry" },
      { label: "Bulk / wholesale orders", subject: "Wholesale inquiry" },
    ],
  },
  {
    icon: "\u{1F4B3}",
    title: "Payments",
    description: "Payment methods, failed transactions & invoices",
    type: "Payment Issue",
    articles: [
      { label: "My payment was declined", subject: "Payment declined issue" },
      { label: "Which payment methods do you accept?", subject: "Payment methods inquiry" },
      { label: "I need an invoice", subject: "Invoice request" },
    ],
  },
  {
    icon: "\u{1F451}",
    title: "Loyalty Program",
    description: "Points, rewards & membership tiers",
    type: "Loyalty Program",
    articles: [
      { label: "How do I earn points?", subject: "Loyalty points inquiry" },
      { label: "How do I redeem my rewards?", subject: "Rewards redemption" },
      { label: "What are the membership tiers?", subject: "Membership tiers inquiry" },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  STYLES (inline — self-contained component)                         */
/* ------------------------------------------------------------------ */

const FONT_HEADING = "var(--font-barlow-condensed), 'Arial Narrow', sans-serif";
const FONT_BODY = "var(--font-barlow), 'Helvetica Neue', sans-serif";

const COLOR = {
  bg: "#0a0a0a",
  card: "#111111",
  border: "#222222",
  muted: "#888888",
  white: "#ffffff",
  black: "#000000",
  brand: "#df5641",
  brandHover: "#c94a36",
} as const;

/* ------------------------------------------------------------------ */
/*  COMPONENT                                                          */
/* ------------------------------------------------------------------ */

type View = "home" | "form" | "success";

export default function PortalPage() {
  const isMobile = useIsMobile();
  const [view, setView] = useState<View>("home");
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Form state
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formOrder, setFormOrder] = useState("");
  const [formType, setFormType] = useState("");
  const [formSubject, setFormSubject] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formPriority, setFormPriority] = useState("Medium");
  const [sending, setSending] = useState(false);

  // Success state
  const [successEmail, setSuccessEmail] = useState("");
  const [successCase, setSuccessCase] = useState("");

  function goToForm(subject?: string, type?: string) {
    if (subject) setFormSubject(subject);
    if (type) setFormType(type);
    setView("form");
    window.scrollTo(0, 0);
  }

  function resetForm() {
    setFormName("");
    setFormEmail("");
    setFormOrder("");
    setFormType("");
    setFormSubject("");
    setFormDesc("");
    setFormPriority("Medium");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSending(true);

    try {
      const res = await fetch("/api/webhooks/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          email: formEmail,
          orderNumber: formOrder,
          type: formType,
          subject: formSubject,
          description: formDesc,
          priority: formPriority.toUpperCase(),
        }),
      });
      const json = (await res.json()) as { caseNumber?: string };
      setSuccessEmail(formEmail);
      setSuccessCase(json.caseNumber ?? `CASE-${String(Math.floor(Math.random() * 99999)).padStart(5, "0")}`);
    } catch {
      setSuccessEmail(formEmail);
      setSuccessCase(`CASE-${String(Math.floor(Math.random() * 99999)).padStart(5, "0")}`);
    }

    setSending(false);
    resetForm();
    setView("success");
    window.scrollTo(0, 0);
  }

  /* ---- Shared input styles ---- */
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    backgroundColor: COLOR.card,
    border: `1px solid ${COLOR.border}`,
    borderRadius: 3,
    color: COLOR.white,
    fontFamily: FONT_BODY,
    fontSize: 14,
    outline: "none",
    transition: "border-color 0.2s",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: COLOR.bg,
        color: COLOR.white,
        fontFamily: FONT_BODY,
        display: "flex",
        flexDirection: "column",
      }}
    >
        {/* ============ HEADER ============ */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            padding: isMobile ? "16px 20px" : "20px 32px",
            borderBottom: `1px solid ${COLOR.border}`,
          }}
        >
          <span
            style={{
              fontFamily: FONT_HEADING,
              fontWeight: 700,
              fontSize: 18,
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            THE DUNGEON{" "}
            <span style={{ color: COLOR.muted, fontWeight: 400 }}>|</span>{" "}
            <span style={{ color: COLOR.muted, fontWeight: 400, fontSize: 14, letterSpacing: 1 }}>
              Support
            </span>
          </span>
          <button
            onClick={() => goToForm()}
            style={{
              padding: "8px 20px",
              backgroundColor: COLOR.brand,
              color: COLOR.white,
              border: "none",
              borderRadius: 3,
              fontFamily: FONT_HEADING,
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: 1,
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            New Case
          </button>
        </header>

        {/* ============ MAIN CONTENT ============ */}
        <main style={{ flex: 1, maxWidth: 960, width: "100%", margin: "0 auto", padding: isMobile ? "0 16px" : "0 24px" }}>

          {/* ---------- HOME VIEW ---------- */}
          {view === "home" && (
            <div>
              {/* Hero */}
              <section style={{ textAlign: "center", padding: isMobile ? "40px 0 32px" : "64px 0 48px" }}>
                <h1
                  style={{
                    fontFamily: FONT_HEADING,
                    fontWeight: 700,
                    fontSize: isMobile ? 32 : 48,
                    textTransform: "uppercase",
                    letterSpacing: 2,
                    lineHeight: 1.1,
                    margin: 0,
                  }}
                >
                  <span style={{ color: COLOR.muted }}>How can we</span>
                  <br />
                  <span style={{ color: COLOR.brand, fontWeight: 700 }}>HELP YOU?</span>
                </h1>
                <p
                  style={{
                    color: COLOR.muted,
                    fontSize: 15,
                    marginTop: 16,
                    marginBottom: 32,
                  }}
                >
                  Browse our help centre or submit a support case below
                </p>
                <div style={{ maxWidth: 480, margin: "0 auto", position: "relative" }}>
                  <input
                    type="text"
                    placeholder="Search for answers..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setExpandedCategory(null); }}
                    style={{
                      ...inputStyle,
                      padding: "12px 18px",
                      fontSize: 15,
                      textAlign: search ? "left" : "center",
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = COLOR.brand)}
                    onBlur={(e) => (e.currentTarget.style.borderColor = COLOR.border)}
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      style={{
                        position: "absolute",
                        right: 12,
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "none",
                        border: "none",
                        color: COLOR.muted,
                        fontSize: 18,
                        cursor: "pointer",
                        padding: "0 4px",
                        lineHeight: 1,
                      }}
                    >
                      &times;
                    </button>
                  )}
                </div>
              </section>

              {/* Search results */}
              {search.trim() && (() => {
                const q = search.toLowerCase();
                const results: { label: string; subject: string; type: string; categoryTitle: string }[] = [];
                for (const cat of CATEGORIES) {
                  for (const article of cat.articles) {
                    if (
                      article.label.toLowerCase().includes(q) ||
                      article.subject.toLowerCase().includes(q) ||
                      cat.title.toLowerCase().includes(q) ||
                      cat.description.toLowerCase().includes(q)
                    ) {
                      results.push({ ...article, type: cat.type, categoryTitle: cat.title });
                    }
                  }
                }

                if (results.length === 0) {
                  return (
                    <section
                      style={{
                        padding: "40px 28px",
                        textAlign: "center",
                        backgroundColor: COLOR.card,
                        border: `1px solid ${COLOR.border}`,
                        borderRadius: 3,
                      }}
                    >
                      <p style={{ color: COLOR.muted, fontSize: 14, margin: 0 }}>
                        No results found for &ldquo;{search}&rdquo;
                      </p>
                      <button
                        onClick={() => goToForm(search, "")}
                        style={{
                          marginTop: 16,
                          padding: "8px 24px",
                          backgroundColor: COLOR.white,
                          color: COLOR.black,
                          border: "none",
                          borderRadius: 3,
                          fontFamily: FONT_HEADING,
                          fontWeight: 700,
                          fontSize: 13,
                          letterSpacing: 1,
                          textTransform: "uppercase",
                          cursor: "pointer",
                        }}
                      >
                        Submit a Case Instead
                      </button>
                    </section>
                  );
                }

                return (
                  <section
                    style={{
                      padding: "24px 28px",
                      borderLeft: `3px solid ${COLOR.brand}`,
                      backgroundColor: COLOR.card,
                      borderRadius: 3,
                    }}
                  >
                    <h3
                      style={{
                        fontFamily: FONT_HEADING,
                        fontWeight: 700,
                        fontSize: 15,
                        textTransform: "uppercase",
                        letterSpacing: 1,
                        marginTop: 0,
                        marginBottom: 16,
                        color: COLOR.white,
                      }}
                    >
                      {results.length} result{results.length !== 1 ? "s" : ""} found
                    </h3>
                    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                      {results.map((r) => (
                        <li key={`${r.categoryTitle}-${r.label}`} style={{ marginBottom: 10 }}>
                          <button
                            onClick={() => goToForm(r.subject, r.type)}
                            style={{
                              background: "none",
                              border: "none",
                              color: COLOR.muted,
                              fontSize: 14,
                              fontFamily: FONT_BODY,
                              cursor: "pointer",
                              padding: "4px 0",
                              textAlign: "left",
                              transition: "color 0.15s",
                              width: "100%",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = COLOR.white)}
                            onMouseLeave={(e) => (e.currentTarget.style.color = COLOR.muted)}
                          >
                            <span style={{ color: COLOR.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>
                              {r.categoryTitle}
                            </span>
                            <br />
                            {r.label} &rarr;
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })()}

              {/* Category grid */}
              {!search.trim() && (
                <section
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
                    gap: 16,
                  }}
                >
                  {CATEGORIES.map((cat) => {
                    const isActive = expandedCategory === cat.title;
                    return (
                      <button
                        key={cat.title}
                        onClick={() => setExpandedCategory(isActive ? null : cat.title)}
                        style={{
                          textAlign: "left",
                          padding: 24,
                          backgroundColor: COLOR.card,
                          border: `1px solid ${isActive ? COLOR.brand : COLOR.border}`,
                          borderRadius: 3,
                          cursor: "pointer",
                          transition: "border-color 0.2s",
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) e.currentTarget.style.borderColor = COLOR.brand;
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) e.currentTarget.style.borderColor = COLOR.border;
                        }}
                      >
                        <div style={{ fontSize: 28, marginBottom: 12 }}>{cat.icon}</div>
                        <div
                          style={{
                            fontFamily: FONT_HEADING,
                            fontWeight: 700,
                            fontSize: 16,
                            textTransform: "uppercase",
                            letterSpacing: 1,
                            color: COLOR.white,
                            marginBottom: 6,
                          }}
                        >
                          {cat.title}
                        </div>
                        <div style={{ color: COLOR.muted, fontSize: 13, lineHeight: 1.5 }}>
                          {cat.description}
                        </div>
                      </button>
                    );
                  })}
                </section>
              )}

              {/* Expanded article list */}
              {!search.trim() && expandedCategory && (() => {
                const cat = CATEGORIES.find((c) => c.title === expandedCategory);
                if (!cat) return null;
                return (
                  <section
                    style={{
                      marginTop: 24,
                      padding: "24px 28px",
                      borderLeft: `3px solid ${COLOR.brand}`,
                      backgroundColor: COLOR.card,
                      borderRadius: 3,
                    }}
                  >
                    <h3
                      style={{
                        fontFamily: FONT_HEADING,
                        fontWeight: 700,
                        fontSize: 15,
                        textTransform: "uppercase",
                        letterSpacing: 1,
                        marginTop: 0,
                        marginBottom: 16,
                        color: COLOR.white,
                      }}
                    >
                      {cat.title} — Common Questions
                    </h3>
                    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                      {cat.articles.map((article) => (
                        <li key={article.label} style={{ marginBottom: 10 }}>
                          <button
                            onClick={() => goToForm(article.subject, cat.type)}
                            style={{
                              background: "none",
                              border: "none",
                              color: COLOR.muted,
                              fontSize: 14,
                              fontFamily: FONT_BODY,
                              cursor: "pointer",
                              padding: "4px 0",
                              textAlign: "left",
                              transition: "color 0.15s",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = COLOR.white)}
                            onMouseLeave={(e) => (e.currentTarget.style.color = COLOR.muted)}
                          >
                            {article.label} &rarr;
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })()}

              {/* CTA Banner */}
              <section
                style={{
                  marginTop: 56,
                  marginBottom: 56,
                  padding: "40px 32px",
                  textAlign: "center",
                  backgroundColor: COLOR.card,
                  border: `1px solid ${COLOR.border}`,
                  borderRadius: 3,
                }}
              >
                <h2
                  style={{
                    fontFamily: FONT_HEADING,
                    fontWeight: 700,
                    fontSize: 24,
                    textTransform: "uppercase",
                    letterSpacing: 2,
                    marginTop: 0,
                    marginBottom: 8,
                  }}
                >
                  Still need help?
                </h2>
                <p style={{ color: COLOR.muted, fontSize: 14, marginBottom: 24 }}>
                  Our team typically responds within 24 hours
                </p>
                <button
                  onClick={() => goToForm()}
                  style={{
                    padding: "12px 32px",
                    backgroundColor: COLOR.white,
                    color: COLOR.black,
                    border: "none",
                    borderRadius: 3,
                    fontFamily: FONT_HEADING,
                    fontWeight: 700,
                    fontSize: 14,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    cursor: "pointer",
                  }}
                >
                  Submit a Case
                </button>
              </section>
            </div>
          )}

          {/* ---------- FORM VIEW ---------- */}
          {view === "form" && (
            <div style={{ padding: "40px 0 56px" }}>
              <button
                onClick={() => { setView("home"); window.scrollTo(0, 0); }}
                style={{
                  background: "none",
                  border: "none",
                  color: COLOR.muted,
                  fontSize: 13,
                  fontFamily: FONT_BODY,
                  cursor: "pointer",
                  padding: 0,
                  marginBottom: 32,
                  transition: "color 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = COLOR.white)}
                onMouseLeave={(e) => (e.currentTarget.style.color = COLOR.muted)}
              >
                &larr; Back to Help Center
              </button>

              <h2
                style={{
                  fontFamily: FONT_HEADING,
                  fontWeight: 700,
                  fontSize: isMobile ? 24 : 28,
                  textTransform: "uppercase",
                  letterSpacing: 2,
                  marginTop: 0,
                  marginBottom: 32,
                }}
              >
                Submit a Case
              </h2>

              <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Row: Name + Email */}
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: COLOR.muted, marginBottom: 6, fontFamily: FONT_HEADING, textTransform: "uppercase", letterSpacing: 1 }}>
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="Your full name"
                      style={inputStyle}
                      onFocus={(e) => (e.currentTarget.style.borderColor = COLOR.brand)}
                      onBlur={(e) => (e.currentTarget.style.borderColor = COLOR.border)}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: COLOR.muted, marginBottom: 6, fontFamily: FONT_HEADING, textTransform: "uppercase", letterSpacing: 1 }}>
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      placeholder="you@example.com"
                      style={inputStyle}
                      onFocus={(e) => (e.currentTarget.style.borderColor = COLOR.brand)}
                      onBlur={(e) => (e.currentTarget.style.borderColor = COLOR.border)}
                    />
                  </div>
                </div>

                {/* Row: Order Number + Case Type */}
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: COLOR.muted, marginBottom: 6, fontFamily: FONT_HEADING, textTransform: "uppercase", letterSpacing: 1 }}>
                      Order Number
                    </label>
                    <input
                      type="text"
                      value={formOrder}
                      onChange={(e) => setFormOrder(e.target.value)}
                      placeholder="#DG-00000 (optional)"
                      style={inputStyle}
                      onFocus={(e) => (e.currentTarget.style.borderColor = COLOR.brand)}
                      onBlur={(e) => (e.currentTarget.style.borderColor = COLOR.border)}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: COLOR.muted, marginBottom: 6, fontFamily: FONT_HEADING, textTransform: "uppercase", letterSpacing: 1 }}>
                      Case Type
                    </label>
                    <select
                      value={formType}
                      onChange={(e) => setFormType(e.target.value)}
                      style={{
                        ...inputStyle,
                        appearance: "none",
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888888' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "right 12px center",
                        paddingRight: 36,
                      }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = COLOR.brand)}
                      onBlur={(e) => (e.currentTarget.style.borderColor = COLOR.border)}
                    >
                      <option value="">Select type...</option>
                      {CASE_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Subject */}
                <div>
                  <label style={{ display: "block", fontSize: 12, color: COLOR.muted, marginBottom: 6, fontFamily: FONT_HEADING, textTransform: "uppercase", letterSpacing: 1 }}>
                    Subject
                  </label>
                  <input
                    type="text"
                    required
                    value={formSubject}
                    onChange={(e) => setFormSubject(e.target.value)}
                    placeholder="Brief summary of your issue"
                    style={inputStyle}
                    onFocus={(e) => (e.currentTarget.style.borderColor = COLOR.brand)}
                    onBlur={(e) => (e.currentTarget.style.borderColor = COLOR.border)}
                  />
                </div>

                {/* Description */}
                <div>
                  <label style={{ display: "block", fontSize: 12, color: COLOR.muted, marginBottom: 6, fontFamily: FONT_HEADING, textTransform: "uppercase", letterSpacing: 1 }}>
                    Description
                  </label>
                  <textarea
                    required
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    placeholder="Please describe your issue in detail..."
                    rows={6}
                    style={{
                      ...inputStyle,
                      minHeight: 160,
                      resize: "vertical",
                      lineHeight: 1.6,
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = COLOR.brand)}
                    onBlur={(e) => (e.currentTarget.style.borderColor = COLOR.border)}
                  />
                </div>

                {/* Priority */}
                <div style={{ maxWidth: 240 }}>
                  <label style={{ display: "block", fontSize: 12, color: COLOR.muted, marginBottom: 6, fontFamily: FONT_HEADING, textTransform: "uppercase", letterSpacing: 1 }}>
                    Priority
                  </label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value)}
                    style={{
                      ...inputStyle,
                      appearance: "none",
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888888' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                      backgroundRepeat: "no-repeat",
                      backgroundPosition: "right 12px center",
                      paddingRight: 36,
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = COLOR.brand)}
                    onBlur={(e) => (e.currentTarget.style.borderColor = COLOR.border)}
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>

                {/* Submit */}
                <div style={{ paddingTop: 8 }}>
                  <button
                    type="submit"
                    disabled={sending}
                    style={{
                      padding: "12px 36px",
                      backgroundColor: sending ? COLOR.muted : COLOR.brand,
                      color: COLOR.white,
                      border: "none",
                      borderRadius: 3,
                      fontFamily: FONT_HEADING,
                      fontWeight: 700,
                      fontSize: 14,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      cursor: sending ? "not-allowed" : "pointer",
                      transition: "background-color 0.2s",
                    }}
                  >
                    {sending ? "Submitting..." : "Submit Case"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ---------- SUCCESS VIEW ---------- */}
          {view === "success" && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                padding: "80px 24px",
                minHeight: "60vh",
              }}
            >
              {/* Checkmark */}
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  border: `2px solid ${COLOR.brand}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 24,
                }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={COLOR.brand} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>

              {/* Badge */}
              <span
                style={{
                  display: "inline-block",
                  padding: "6px 16px",
                  backgroundColor: "#df564120",
                  border: "1px solid #df564140",
                  borderRadius: 3,
                  fontFamily: FONT_HEADING,
                  fontWeight: 600,
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: 1.5,
                  color: COLOR.white,
                  marginBottom: 24,
                }}
              >
                Case Submitted
              </span>

              {/* Heading */}
              <h1
                style={{
                  fontFamily: FONT_HEADING,
                  fontWeight: 700,
                  fontSize: isMobile ? 28 : 36,
                  textTransform: "uppercase",
                  letterSpacing: 2,
                  margin: "0 0 12px",
                  color: COLOR.white,
                }}
              >
                We got your <span style={{ color: COLOR.white }}>MESSAGE.</span>
              </h1>

              <p style={{ color: COLOR.muted, fontSize: 14, marginBottom: 32 }}>
                A confirmation will be sent to <strong style={{ color: COLOR.white }}>{successEmail}</strong>
              </p>

              {/* Case number box */}
              <div
                style={{
                  maxWidth: "100%",
                  padding: isMobile ? "18px 24px" : "20px 40px",
                  backgroundColor: COLOR.card,
                  border: `1px solid ${COLOR.border}`,
                  borderRadius: 3,
                  marginBottom: 40,
                }}
              >
                <div style={{ fontSize: 11, color: COLOR.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                  Your Case Number
                </div>
                <div
                  style={{
                    fontFamily: FONT_HEADING,
                    fontWeight: 700,
                    fontSize: isMobile ? 26 : 32,
                    letterSpacing: 3,
                    color: COLOR.white,
                    wordBreak: "break-word",
                  }}
                >
                  {successCase}
                </div>
              </div>

              {/* Buttons */}
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12 }}>
                <button
                  onClick={() => { setView("home"); window.scrollTo(0, 0); }}
                  style={{
                    padding: "10px 28px",
                    backgroundColor: COLOR.white,
                    color: COLOR.black,
                    border: "none",
                    borderRadius: 3,
                    fontFamily: FONT_HEADING,
                    fontWeight: 700,
                    fontSize: 13,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    cursor: "pointer",
                  }}
                >
                  Back to Help Center
                </button>
                <button
                  onClick={() => { resetForm(); setView("form"); window.scrollTo(0, 0); }}
                  style={{
                    padding: "10px 28px",
                    backgroundColor: "transparent",
                    color: COLOR.brand,
                    border: `1px solid ${COLOR.brand}`,
                    borderRadius: 3,
                    fontFamily: FONT_HEADING,
                    fontWeight: 700,
                    fontSize: 13,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    cursor: "pointer",
                    transition: "background-color 0.2s, color 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = COLOR.brand;
                    e.currentTarget.style.color = COLOR.white;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                    e.currentTarget.style.color = COLOR.brand;
                  }}
                >
                  Submit Another
                </button>
              </div>
            </div>
          )}
        </main>

        {/* ============ FOOTER ============ */}
        <footer
          style={{
            borderTop: `1px solid ${COLOR.border}`,
            padding: isMobile ? "20px 16px" : "24px 32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <span style={{ color: COLOR.muted, fontSize: 12 }}>
            &copy; The Dungeon Gear &middot; Dubai, UAE
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: isMobile ? 14 : 20 }}>
            {[
              { label: "Shipping Policy", href: "https://thedungeonmerch.com/policies/shipping-policy" },
              { label: "Refund Policy", href: "https://thedungeonmerch.com/policies/refund-policy" },
              { label: "Terms of Service", href: "https://thedungeonmerch.com/policies/terms-of-service" },
            ].map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "#555555",
                  fontSize: 12,
                  textDecoration: "none",
                  transition: "color 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = COLOR.white)}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#555555")}
              >
                {link.label}
              </a>
            ))}
          </div>
        </footer>
      </div>
  );
}
