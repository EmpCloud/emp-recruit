import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Calendar,
  Clock,
  ExternalLink,
  Loader2,
  AlertCircle,
  MapPin,
  Video,
  Phone,
  Users,
  FileEdit,
  Briefcase,
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "/api/v1";

const INTERVIEW_TYPE_CONFIG: Record<
  string,
  { icon: React.ReactNode; label: string; color: string; bg: string }
> = {
  video: { icon: <Video className="h-4 w-4" />, label: "Video", color: "text-blue-700", bg: "bg-blue-100" },
  phone: { icon: <Phone className="h-4 w-4" />, label: "Phone", color: "text-green-700", bg: "bg-green-100" },
  onsite: { icon: <MapPin className="h-4 w-4" />, label: "On-site", color: "text-orange-700", bg: "bg-orange-100" },
  panel: { icon: <Users className="h-4 w-4" />, label: "Panel", color: "text-purple-700", bg: "bg-purple-100" },
  assignment: { icon: <FileEdit className="h-4 w-4" />, label: "Assignment", color: "text-indigo-700", bg: "bg-indigo-100" },
};

interface InterviewData {
  id: string;
  type: string;
  round: number;
  title: string;
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
  meeting_link: string | null;
  status: string;
  job_title: string;
  job_department: string | null;
}

export function PortalInterviewsPage() {
  const [interviews, setInterviews] = useState<InterviewData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("portal_token");
    if (!token) {
      setError("No access token found. Please request a new portal link.");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/portal/interviews`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          if (res.status === 401) {
            localStorage.removeItem("portal_token");
            throw new Error("Your access link has expired. Please request a new one.");
          }
          throw new Error(body?.error?.message || "Failed to load interviews");
        }

        const json = await res.json();
        setInterviews(json.data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <AlertCircle className="mx-auto mb-4 h-10 w-10 text-red-500" />
          <p className="mb-4 text-gray-700">{error}</p>
          <Link
            to="/portal"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Request New Link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Upcoming Interviews</h1>
        <p className="mt-1 text-gray-600">
          Your scheduled interviews and meeting details.
        </p>
      </div>

      {interviews.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <Calendar className="mx-auto mb-4 h-10 w-10 text-gray-400" />
          <p className="text-gray-600">No upcoming interviews scheduled.</p>
          <Link
            to="/portal/dashboard"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            Back to Dashboard
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {interviews.map((interview) => {
            const typeConfig = INTERVIEW_TYPE_CONFIG[interview.type] || {
              icon: <Calendar className="h-4 w-4" />,
              label: interview.type,
              color: "text-gray-700",
              bg: "bg-gray-100",
            };

            const scheduledDate = new Date(interview.scheduled_at);
            const isToday =
              scheduledDate.toDateString() === new Date().toDateString();
            const isTomorrow =
              scheduledDate.toDateString() ===
              new Date(Date.now() + 86400000).toDateString();

            let dateLabel = scheduledDate.toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            });
            if (isToday) dateLabel = "Today";
            if (isTomorrow) dateLabel = "Tomorrow";

            return (
              <div
                key={interview.id}
                className={`rounded-xl border bg-white p-6 shadow-sm ${
                  isToday ? "border-brand-300 ring-1 ring-brand-100" : "border-gray-200"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-base font-semibold text-gray-900">
                        {interview.title}
                      </h3>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${typeConfig.bg} ${typeConfig.color}`}
                      >
                        {typeConfig.icon}
                        {typeConfig.label}
                      </span>
                      {isToday && (
                        <span className="inline-flex items-center rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-medium text-brand-700">
                          Today
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                      <Briefcase className="h-3.5 w-3.5 text-gray-400" />
                      <span>{interview.job_title}</span>
                      {interview.job_department && (
                        <span className="text-gray-400">
                          &middot; {interview.job_department}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-sm text-gray-600 mt-3">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        {dateLabel}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4 text-gray-400" />
                        {scheduledDate.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        ({interview.duration_minutes} min)
                      </span>
                    </div>

                    {interview.location && (
                      <p className="mt-2 flex items-center gap-1.5 text-sm text-gray-600">
                        <MapPin className="h-4 w-4 text-gray-400" />
                        {interview.location}
                      </p>
                    )}

                    <p className="mt-1 text-xs text-gray-400">
                      Round {interview.round}
                    </p>
                  </div>

                  {interview.meeting_link && (
                    <a
                      href={interview.meeting_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-4 flex-shrink-0 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700 transition-colors"
                    >
                      Join Meeting
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
