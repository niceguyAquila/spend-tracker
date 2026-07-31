type Props = {
  colSpan: number;
  message: string;
};

export function TableEmptyState({ colSpan, message }: Props) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-4 text-center text-muted">
        {message}
      </td>
    </tr>
  );
}
