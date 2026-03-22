import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MapPin, Briefcase, Clock, Building2 } from "lucide-react";
import axios from "axios";
import type { JobPosting, CareerPage } from "@emp-recruit/shared";

const PUBLIC_API = "/api/v1/public";

export function CareerListPage() {
  const { slug } = useParams<{ slug: string }>();

  const careerQuery = useQuery({
    queryKey: ["public-career", slug],
    queryFn: async () => {
      const { data } = await axios.get(`${PUBLIC_API}/careers/${slug}`);
      return data.data as { careerPage: CareerPage; orgName: string; orgLogo: string | null };
    },
  });

  const jobsQuery = useQuery({
    queryKey: ["public-jobs", slug],
    queryFn: async () => {
      const { data } = await axios.get(`${PUBLIC_API}/careers/${slug}/jobs`);
      return data.data as JobPosting[];
    },
  });

  if (careerQuery.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (careerQuery.isError) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-center">
        <Building2 className="h-12 w-12 text-gray-300" />
        <h2 className="mt-4 text-xl font-semibold text-gray-900">Career Page Not Found</h2>
        <p className="mt-1 text-sm text-gray-500">This career page does not exist or is inactive.</p>
      </div>
    );
  }

  const career = careerQuery.data!;
  const jobs = jobsQuery.data || [];

  return (
    <div>
      {/* Hero */}
      <div className="mb-8 text-center">
        {career.orgLogo && (
          <img
            src={career.orgLogo}
            alt={career.orgName}
            className="mx-auto mb-4 h-16 w-auto"
          />
        )}
        <h1 className="text-3xl font-bold text-gray-900">{career.careerPage.title || career.orgName}</h1>
        <p className="mx-auto mt-2 max-w-2xl text-gray-600">
          {career.careerPage.description || `Explore open positions at ${career.orgName}`}
        </p>
      </div>

      {/* Jobs List */}
      {jobsQuery.isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <Briefcase className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No Open Positions</h3>
          <p className="mt-1 text-sm text-gray-500">Check back later for new opportunities.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm font-medium text-gray-500">{jobs.length} open position{jobs.length !== 1 ? "s" : ""}</p>
          {jobs.map((job) => (
            <Link
              key={job.id}
              to={`/careers/${slug}/jobs/${job.id}`}
              className="block rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900">{job.title}</h3>
                  <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-gray-500">
                    {job.department && (
                      <span className="flex items-center gap-1">
                        <Building2 className="h-4 w-4" />
                        {job.department}
                      </span>
                    )}
                    {job.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {job.location}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Briefcase className="h-4 w-4" />
                      {job.employment_type.replace(/_/g, " ")}
                    </span>
                    {(job.experience_min != null || job.experience_max != null) && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {job.experience_min ?? 0}–{job.experience_max ?? "10+"} yrs
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className="shrink-0 rounded-full px-3 py-1 text-xs font-medium text-white"
                  style={{ backgroundColor: career.careerPage.primary_color }}
                >
                  Apply
                </span>
              </div>
              {(job.salary_min || job.salary_max) && (
                <p className="mt-3 text-sm font-medium text-green-700">
                  {job.salary_currency}{" "}
                  {job.salary_min ? (job.salary_min / 100000).toFixed(1) + "L" : ""} –{" "}
                  {job.salary_max ? (job.salary_max / 100000).toFixed(1) + "L" : ""}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
