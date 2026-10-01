export function FeasibilityNote() {
  return (
    <details className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
      <summary className="cursor-pointer text-foreground">
        მდებარეობის სიზუსტის შესახებ
      </summary>
      <div className="mt-3 space-y-2 leading-relaxed">
        <p>
          <strong className="text-foreground">Tesla-ს ბრაუზერში GPS-ის სიზუსტე შეიძლება განსხვავდებოდეს.</strong>{" "}
          ზოგი firmware მდებარეობას ქსელით ადგენს, რაც ზუსტი ნავიგაციისთვის საკმარისი არ არის.
        </p>
        <p>
          <strong className="text-foreground">აპი:</strong> ითხოვს მაღალი სიზუსტის მდებარეობას,
          მუდმივად აახლებს მას და აჩვენებს სიზუსტის ხარისხს.
        </p>
        <p>
          <strong className="text-foreground">შეზღუდვა:</strong> ბრაუზერს მანქანის GPS ჩიპზე პირდაპირი
          წვდომა არ აქვს. თუ მანქანის მდებარეობა არაზუსტია, დააკავშირეთ ტელეფონი.
        </p>
        <p>
          <strong className="text-foreground">საუკეთესო შედეგი:</strong> დაკავშირებული ტელეფონის GPS
          მანქანის ეკრანს უფრო ზუსტ მდებარეობას აწვდის.
        </p>
        <p>
          <strong className="text-foreground">უკუსვლის შემდეგ:</strong> Tesla ბრაუზერს დროებით აჩერებს.
          ბრაუზერის ხელახლა გახსნისას აქტიური მარშრუტი ავტომატურად გაგრძელდება.
        </p>
      </div>
    </details>
  );
}