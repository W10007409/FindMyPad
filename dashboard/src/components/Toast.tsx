export function Toast({ message }: { message: string }) {
  return <div className="fixed bottom-6 right-6 rounded bg-gray-900 px-4 py-2 text-white shadow-lg">{message}</div>;
}
