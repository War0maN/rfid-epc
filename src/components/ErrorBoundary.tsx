import { Component, type ReactNode } from "react";
import i18n from "../i18n";

/**
 * Компонентын render алдааг барьж, ойлгомжтой мессеж харуулна.
 * Үүнгүй бол React бүх модыг unmount хийж БҮТЭН АПП цагаан дэлгэц болдог
 * (2026-07-29-нд платформын табаас илэрсэн) — алдаа нэг табд хязгаарлагдана.
 * Class компонент = React-д алдаа барих цорын ганц зам.
 * i18n.t-г render дотор дуудна (хэл солиход ч зөв уншигдана).
 */
interface Props {
  children: ReactNode;
  /** Таб солиход алдааг цэвэрлэхэд ашиглана (key-гээр дахин mount хийхэд ч болно). */
  resetKey?: string;
}
interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error) {
    console.error("[ErrorBoundary]", error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="text-sm font-semibold text-red-800">{i18n.t("errors.boundaryTitle")}</p>
        <p className="text-sm text-red-700">{i18n.t("errors.boundaryHint")}</p>
        <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-white/70 p-3 text-xs text-red-900">
          {error.message}
          {error.stack ? "\n\n" + error.stack : ""}
        </pre>
        <button
          onClick={() => this.setState({ error: null })}
          className="h-9 rounded-lg border border-red-300 bg-white px-3 text-sm font-medium text-red-700 hover:bg-red-100"
        >
          {i18n.t("errors.boundaryRetry")}
        </button>
      </div>
    );
  }
}
