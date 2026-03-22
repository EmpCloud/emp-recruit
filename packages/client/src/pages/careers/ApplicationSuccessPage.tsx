import { Link, useParams } from "react-router-dom";
import { CheckCircle } from "lucide-react";

export function ApplicationSuccessPage() {
  const { slug } = useParams<{ slug: string }>();

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <div className="rounded-full bg-green-100 p-4">
        <CheckCircle className="h-16 w-16 text-green-600" />
      </div>
      <h1 className="mt-6 text-3xl font-bold text-gray-900">Thank You for Applying!</h1>
      <p className="mt-3 max-w-md text-gray-600">
        Your application has been submitted successfully. Our recruitment team will review your
        profile and get back to you within 5-7 business days.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          to={`/careers/${slug}`}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Browse More Positions
        </Link>
      </div>
    </div>
  );
}
